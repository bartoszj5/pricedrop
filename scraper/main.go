package main

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type App struct {
	config          Config
	db              *DB
	publisher       *Publisher
	registry        *ScraperRegistry
	crawlerRegistry *CrawlerRegistry
	scrapeGuard     jobGuard
	crawlGuard      jobGuard
	linkMoreleGuard jobGuard
	linkMEGuard     jobGuard
	linkAmazonGuard jobGuard
	enrichGuard     jobGuard
}

// linkParams holds the common query parameters shared by all /link/* handlers.
type linkParams struct {
	DryRun        bool
	Probe         bool
	Limit         int
	MinScore      float64
	MaxCandidates int
	SourceStore   string
	Category      string
}

// parseLinkParams extracts the common link query parameters from a request.
// defaultMinScore allows per-store overrides (e.g. Amazon uses 0.40).
func parseLinkParams(r *http.Request, defaultMinScore float64) linkParams {
	p := linkParams{
		DryRun:        r.URL.Query().Get("dry_run") != "false",
		Probe:         r.URL.Query().Get("probe") == "true" || r.URL.Query().Get("probe") == "1",
		Limit:         20,
		MinScore:      defaultMinScore,
		MaxCandidates: 25,
		SourceStore:   "x-kom",
	}

	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			if n == 0 {
				p.Limit = 0
			} else if n > 0 {
				p.Limit = n
			}
		}
	}

	if v := r.URL.Query().Get("min_score"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 1 {
			p.MinScore = f
		}
	}

	if v := r.URL.Query().Get("max_candidates"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			p.MaxCandidates = n
		}
	}

	if src := strings.TrimSpace(r.URL.Query().Get("source")); src != "" {
		p.SourceStore = src
	}

	p.Category = strings.TrimSpace(r.URL.Query().Get("category"))
	return p
}

func main() {
	cfg := LoadConfig()

	db, err := NewDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	registry := NewScraperRegistry()
	meScraper := NewMediaExpertScraper(cfg.UserAgent, cfg.RequestDelay)
	xkomScraperDelay := time.Duration(0)
	registry.Register("x-kom", NewXKomScraper(cfg.UserAgent, xkomScraperDelay))
	registry.Register("mediaexpert", meScraper)
	registry.Register("morele", NewMoreleScraper(cfg.UserAgent, cfg.RequestDelay))
	registry.Register("amazon", NewAmazonScraper(cfg.UserAgent, cfg.RequestDelay))

	crawlerRegistry := NewCrawlerRegistry()
	crawlerRegistry.Register("x-kom", NewXKomCrawler(cfg.UserAgent, cfg.RequestDelay))
	crawlerRegistry.Register("morele", NewMoreleCrawler(cfg.UserAgent, cfg.RequestDelay))
	crawlerRegistry.Register("mediaexpert", NewMediaExpertCrawler(meScraper))

	pub, err := NewPublisher(cfg.RabbitMQURL)
	if err != nil {
		log.Printf("WARNING: RabbitMQ not available, price events will not be published: %v", err)
	} else {
		defer pub.Close()
	}

	embeddingsClient = NewEmbeddingsClient(cfg.EmbeddingsURL, cfg.EmbeddingsTimeout)
	if embeddingsClient != nil {
		log.Printf("Embeddings service configured: %s (timeout=%s)", cfg.EmbeddingsURL, cfg.EmbeddingsTimeout)
	} else {
		log.Printf("Embeddings service disabled — linker falls back to Jaccard title matching")
	}

	app := &App{
		config:          cfg,
		db:              db,
		publisher:       pub,
		registry:        registry,
		crawlerRegistry: crawlerRegistry,
	}

	if pub != nil {
		consumer := NewLinkConsumer(app)
		go consumer.Run(context.Background())
		log.Printf("[link/consumer] started")
	} else {
		log.Printf("[link/consumer] not started — RabbitMQ unavailable")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.handleHealth)
	mux.HandleFunc("/scrape/test", app.requireInternalToken(app.handleScrapeTest))
	mux.HandleFunc("/scrape", app.requireInternalToken(app.handleScrape))
	mux.HandleFunc("/scrape/", app.requireInternalToken(app.handleScrapeStore))
	mux.HandleFunc("/crawl", app.requireInternalToken(app.handleCrawl))
	mux.HandleFunc("/crawl/", app.requireInternalToken(app.handleCrawlStore))
	mux.HandleFunc("/link/morele", app.requireInternalToken(app.handleLink("morele", 0.45, &app.linkMoreleGuard, app.runLinkMorele)))
	mux.HandleFunc("/link/mediaexpert", app.requireInternalToken(app.handleLink("mediaexpert", 0.45, &app.linkMEGuard, app.runLinkMediaExpert)))
	mux.HandleFunc("/link/amazon", app.requireInternalToken(app.handleLink("amazon", 0.50, &app.linkAmazonGuard, app.runLinkAmazon)))
	mux.HandleFunc("/enrich/x-kom-manufacturer-code", app.requireInternalToken(app.handleEnrichXKOMManufacturer))

	log.Printf("Scraper listening on :%s", cfg.Port)
	log.Printf("Registered scrapers: %v", registry.RegisteredSlugs())
	log.Printf("Registered crawlers: %v", crawlerRegistry.RegisteredSlugs())
	log.Printf("Scheduler intervals: scrape=%s crawl=%s", cfg.ScrapeInterval, cfg.CrawlInterval)
	app.startSchedulers()
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
}

func (app *App) startSchedulers() {
	app.startScheduledJob("scrape", app.config.ScrapeInterval, &app.scrapeGuard, app.runScrapeAllStoresJob)
	app.startScheduledJob("crawl", app.config.CrawlInterval, &app.crawlGuard, func() {
		app.runCrawlAllStoresJob(defaultCrawlMaxPages)
	})
}

func (app *App) startScheduledJob(name string, interval time.Duration, guard *jobGuard, job func()) {
	if interval <= 0 {
		log.Printf("[%s/scheduler] disabled (interval=%s)", name, interval)
		return
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		log.Printf("[%s/scheduler] started (interval=%s)", name, interval)
		for range ticker.C {
			if !guard.tryStart() {
				log.Printf("[%s/scheduler] skip tick: job already in progress", name)
				continue
			}

			go func() {
				started := time.Now()
				log.Printf("[%s/scheduler] run started", name)
				defer func() {
					guard.finish()
					log.Printf("[%s/scheduler] run finished in %s", name, time.Since(started).Round(time.Second))
				}()

				job()
			}()
		}
	}()
}

func (app *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "scraper",
	})
}

// handleScrape triggers scraping for all registered stores.
// POST /scrape
func (app *App) handleScrape(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !app.scrapeGuard.tryStart() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "scrape already in progress"})
		return
	}

	go func() {
		defer app.scrapeGuard.finish()
		app.runScrapeAllStoresJob()
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "scrape started for all stores"})
}

// handleScrapeStore triggers scraping for a specific store.
// POST /scrape/{store-slug}
func (app *App) handleScrapeStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storeSlug := strings.TrimPrefix(r.URL.Path, "/scrape/")
	if storeSlug == "" {
		http.Error(w, "store slug required", http.StatusBadRequest)
		return
	}

	if _, err := app.registry.Get(storeSlug); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	if !app.scrapeGuard.tryStart() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "scrape already in progress"})
		return
	}

	go func() {
		defer app.scrapeGuard.finish()
		result := app.scrapeStore(storeSlug)
		log.Printf("Scrape %s completed: %+v", storeSlug, result)
		app.InvalidateAPICache()
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{
		"status": "scrape started",
		"store":  storeSlug,
	})
}

type ScrapeStoreResult struct {
	Store          string `json:"store"`
	Total          int    `json:"total"`
	Updated        int    `json:"updated"`
	Unchanged      int    `json:"unchanged"`
	Errors         int    `json:"errors"`
	DurationMillis int64  `json:"duration_ms"`
}

func (app *App) scrapeAllStores() []ScrapeStoreResult {
	var results []ScrapeStoreResult
	for _, slug := range app.registry.RegisteredSlugs() {
		result := app.scrapeStore(slug)
		results = append(results, result)
	}
	return results
}

func (app *App) runScrapeAllStoresJob() {
	results := app.scrapeAllStores()
	log.Printf("Scrape all completed: %+v", results)
	app.InvalidateAPICache()
}

func (app *App) scrapeStore(storeSlug string) ScrapeStoreResult {
	start := time.Now()
	result := ScrapeStoreResult{Store: storeSlug}

	scraper, err := app.registry.Get(storeSlug)
	if err != nil {
		log.Printf("No scraper for %s: %v", storeSlug, err)
		result.Errors = 1
		result.DurationMillis = time.Since(start).Milliseconds()
		return result
	}

	prices, err := app.db.GetPricesForStore(storeSlug)
	if err != nil {
		log.Printf("Failed to get prices for %s: %v", storeSlug, err)
		result.Errors = 1
		result.DurationMillis = time.Since(start).Milliseconds()
		return result
	}

	result.Total = len(prices)
	log.Printf("[%s] Found %d prices to check", storeSlug, len(prices))

	for _, p := range prices {
		scraped, err := scraper.ScrapeProduct(p.URL)
		if err != nil {
			log.Printf("[%s] Error scraping %s (%s): %v", storeSlug, p.ProductTitle, p.URL, err)
			result.Errors++
			// Still mark as checked so we don't hammer a broken URL.
			app.db.MarkChecked(p.ID)
			continue
		}

		if storeSlug == "x-kom" {
			if mc := strings.TrimSpace(scraped.ManufacturerCode); mc != "" {
				if err := app.db.SetProductManufacturerCode(p.ProductID, mc); err != nil {
					log.Printf("[%s] manufacturer_code for product %d: %v", storeSlug, p.ProductID, err)
				}
			}
		}

		log.Printf("[%s] %s: %.2f %s (was %.2f), available=%v",
			storeSlug, p.ProductTitle, scraped.Price, scraped.Currency, p.CurrentPrice, scraped.IsAvailable)

		// Round to 2 decimal places for comparison.
		newPrice := math.Round(scraped.Price*100) / 100
		oldPrice := math.Round(p.CurrentPrice*100) / 100

		changed, err := app.db.UpdatePrice(p.ID, oldPrice, newPrice, scraped.Currency, scraped.IsAvailable, scraped.ProductName)
		if err != nil {
			log.Printf("[%s] Error updating price for %s: %v", storeSlug, p.ProductTitle, err)
			result.Errors++
			continue
		}

		if changed {
			log.Printf("[%s] Price changed for %s: %.2f -> %.2f", storeSlug, p.ProductTitle, oldPrice, newPrice)
			result.Updated++

			if newPrice < oldPrice && app.publisher != nil {
				app.publisher.PublishPriceDropped(PriceDroppedEvent{
					ProductID:    p.ProductID,
					ProductTitle: p.ProductTitle,
					Store:        storeSlug,
					OldPrice:     oldPrice,
					NewPrice:     newPrice,
					URL:          p.URL,
				})
			}
		} else {
			result.Unchanged++
		}
	}

	result.DurationMillis = time.Since(start).Milliseconds()
	return result
}


// handleScrapeTest scrapes a single URL without touching the database.
// GET /scrape/test?url=https://www.x-kom.pl/p/1222893-sluchawki-bezprzewodowe-soundpeats-air-4-pro-czarne.html
func (app *App) handleScrapeTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	productURL := r.URL.Query().Get("url")
	if productURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url query parameter required"})
		return
	}

	// Determine which scraper to use based on the URL domain.
	var scraper StoreScraper
	for _, slug := range app.registry.RegisteredSlugs() {
		s, _ := app.registry.Get(slug)
		if s != nil {
			scraper = s
			break
		}
	}
	if strings.Contains(productURL, "x-kom.pl") {
		scraper, _ = app.registry.Get("x-kom")
	}
	if strings.Contains(productURL, "mediaexpert.pl") {
		scraper, _ = app.registry.Get("mediaexpert")
	}
	if strings.Contains(productURL, "morele.net") {
		scraper, _ = app.registry.Get("morele")
	}
	if strings.Contains(productURL, "amazon.pl") {
		scraper, _ = app.registry.Get("amazon")
	}

	if scraper == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no scraper found for this URL"})
		return
	}

	result, err := scraper.ScrapeProduct(productURL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// ---------------------------------------------------------------------------
// Crawl endpoints
// ---------------------------------------------------------------------------

const defaultCrawlMaxPages = 5

func (app *App) runCrawlAllStoresJob(maxPages int) {
	var allResults []CrawlCategoryResult
	for _, slug := range app.crawlerRegistry.RegisteredSlugs() {
		results := app.crawlStoreAllCategories(slug, maxPages)
		allResults = append(allResults, results...)
	}
	log.Printf("Crawl all completed: %d category results", len(allResults))
	app.InvalidateAPICache()
}

// handleCrawl triggers crawling for all registered stores.
// POST /crawl
func (app *App) handleCrawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !app.crawlGuard.tryStart() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "crawl already in progress"})
		return
	}

	go func() {
		defer app.crawlGuard.finish()
		app.runCrawlAllStoresJob(defaultCrawlMaxPages)
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "crawl started for all stores"})
}

// handleCrawlStore triggers crawling for a specific store.
// POST /crawl/{store-slug}
// Query params:
//   - category: only crawl this category (must match a key from DefaultCategories)
//   - url: crawl a custom category URL (requires category param for the product category)
//   - max_pages: max listing pages to visit (default 5)
func (app *App) handleCrawlStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storeSlug := strings.TrimPrefix(r.URL.Path, "/crawl/")
	if storeSlug == "" {
		http.Error(w, "store slug required", http.StatusBadRequest)
		return
	}

	if _, err := app.crawlerRegistry.Get(storeSlug); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	if !app.crawlGuard.tryStart() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "crawl already in progress"})
		return
	}

	maxPages := defaultCrawlMaxPages
	if v := r.URL.Query().Get("max_pages"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxPages = n
		}
	}

	category := r.URL.Query().Get("category")
	customURL := r.URL.Query().Get("url")

	go func() {
		defer app.crawlGuard.finish()

		var results []CrawlCategoryResult
		if customURL != "" {
			cat := category
			if cat == "" {
				cat = "other"
			}
			result := app.crawlStoreCategory(storeSlug, cat, customURL, maxPages)
			results = append(results, result)
		} else if category != "" {
			crawler, _ := app.crawlerRegistry.Get(storeSlug)
			cats := crawler.DefaultCategories()
			if catURL, ok := cats[category]; ok {
				result := app.crawlStoreCategory(storeSlug, category, catURL, maxPages)
				results = append(results, result)
			} else {
				log.Printf("[crawl] Category %q not found for %s", category, storeSlug)
			}
		} else {
			results = app.crawlStoreAllCategories(storeSlug, maxPages)
		}

		log.Printf("Crawl %s completed: %+v", storeSlug, results)
		app.InvalidateAPICache()
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{
		"status": "crawl started",
		"store":  storeSlug,
	})
}


// crawlStoreAllCategories crawls every default category for the given store.
func (app *App) crawlStoreAllCategories(storeSlug string, maxPages int) []CrawlCategoryResult {
	crawler, err := app.crawlerRegistry.Get(storeSlug)
	if err != nil {
		log.Printf("[crawl] %v", err)
		return nil
	}

	var results []CrawlCategoryResult
	for cat, catURL := range crawler.DefaultCategories() {
		result := app.crawlStoreCategory(storeSlug, cat, catURL, maxPages)
		results = append(results, result)
	}
	return results
}

// crawlStoreCategory discovers products from one category page and upserts them into the DB.
func (app *App) crawlStoreCategory(storeSlug, category, categoryURL string, maxPages int) CrawlCategoryResult {
	start := time.Now()
	result := CrawlCategoryResult{Store: storeSlug, Category: category}

	crawler, err := app.crawlerRegistry.Get(storeSlug)
	if err != nil {
		log.Printf("[crawl/%s] %v", storeSlug, err)
		result.Errors = 1
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	store, err := app.db.GetStoreBySlug(storeSlug)
	if err != nil {
		log.Printf("[crawl/%s] %v", storeSlug, err)
		result.Errors = 1
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}

	// Phase 1 — discover product URLs from listing pages.
	discovered, err := crawler.CrawlCategory(categoryURL, maxPages)
	if err != nil {
		log.Printf("[crawl/%s] Error crawling %s: %v", storeSlug, categoryURL, err)
		result.Errors = 1
		result.DurationMs = time.Since(start).Milliseconds()
		return result
	}
	result.Discovered = len(discovered)
	log.Printf("[crawl/%s/%s] Discovered %d product URLs", storeSlug, category, len(discovered))

	scraper, _ := app.registry.Get(storeSlug)

	// Phase 2 — for each discovered product, check DB and upsert if new.
	for _, dp := range discovered {
		exists, err := app.db.PriceExistsByURL(dp.URL)
		if err != nil {
			log.Printf("[crawl/%s] DB error checking %s: %v", storeSlug, dp.URL, err)
			result.Errors++
			continue
		}
		if exists {
			result.Existing++
			continue
		}

		// Enrich with ScrapeProduct if listing didn't give us enough data.
		title := dp.Title
		price := dp.Price
		currency := dp.Currency
		imageURL := dp.ImageURL
		manufacturerCode := ""

		if (title == "" || price == 0) && scraper != nil {
			scraped, err := scraper.ScrapeProduct(dp.URL)
			if err != nil {
				log.Printf("[crawl/%s] Error scraping %s: %v", storeSlug, dp.URL, err)
				result.Errors++
				continue
			}
			if title == "" {
				title = scraped.ProductName
			}
			if price == 0 {
				price = scraped.Price
			}
			if currency == "" {
				currency = scraped.Currency
			}
			if imageURL == "" {
				imageURL = scraped.ImageURL
			}
			manufacturerCode = scraped.ManufacturerCode
		}

		if title == "" {
			log.Printf("[crawl/%s] Skipping %s — no title", storeSlug, dp.URL)
			result.Errors++
			continue
		}
		if currency == "" {
			currency = "PLN"
		}

		cleanTitle := cleanProductTitle(title)
		productSlug := slugify(normalizeTitle(cleanTitle))
		productID, priceCreated, err := app.db.UpsertProductAndPrice(cleanTitle, productSlug, category, imageURL, store.ID, price, currency, dp.URL, manufacturerCode, title)
		if err != nil {
			log.Printf("[crawl/%s] Error upserting %s: %v", storeSlug, title, err)
			result.Errors++
			continue
		}

		log.Printf("[crawl/%s] NEW: %s (%.2f %s)", storeSlug, title, price, currency)
		result.New++

		if priceCreated && app.publisher != nil {
			app.publisher.PublishProductCreated(ProductCreatedEvent{
				ProductID:        productID,
				SourceSlug:       storeSlug,
				Title:            cleanTitle,
				ManufacturerCode: manufacturerCode,
			})
		}
	}

	result.DurationMs = time.Since(start).Milliseconds()
	log.Printf("[crawl/%s/%s] Done: %d discovered, %d new, %d existing, %d errors (%dms)",
		storeSlug, category, result.Discovered, result.New, result.Existing, result.Errors, result.DurationMs)
	return result
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// linkRunner is the signature shared by runLinkMorele, runLinkMediaExpert, and runLinkAmazon.
type linkRunner func(sourceStoreSlug, category string, limit int, minScore float64, maxHits int, dryRun, probe bool) LinkSummary

// handleLink returns a handler for POST /link/{store}.
// All link endpoints share the same request validation, mutex guarding, and response shape.
func (app *App) handleLink(storeName string, defaultMinScore float64, guard *jobGuard, runner linkRunner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		p := parseLinkParams(r, defaultMinScore)

		if len(p.Category) > 50 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category too long (max 50)"})
			return
		}

		if _, err := app.db.GetStoreBySlug(p.SourceStore); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown source store: " + p.SourceStore})
			return
		}

		if !guard.tryStart() {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "link " + storeName + " job already in progress"})
			return
		}

		go func() {
			defer guard.finish()
			sum := runner(p.SourceStore, p.Category, p.Limit, p.MinScore, p.MaxCandidates, p.DryRun, p.Probe)
			log.Printf("[link/%s] completed: %+v", storeName, sum)
		}()

		resp := map[string]any{
			"status":    "link " + storeName + " started",
			"source":    p.SourceStore,
			"limit":     p.Limit,
			"min_score": p.MinScore,
			"dry_run":   p.DryRun,
			"probe":     p.Probe,
		}
		if p.Category != "" {
			resp["category"] = p.Category
		}
		writeJSON(w, http.StatusAccepted, resp)
	}
}

// handleEnrichXKOMManufacturer scrapes x-kom product pages and saves manufacturer_code (MPN) on products.
// POST /enrich/x-kom-manufacturer-code
// Query: only_missing (default true; only_missing=false re-fetches all selected rows),
// category (optional), limit (default 500, max 5000), probe (zero delay — small tests only).
func (app *App) handleEnrichXKOMManufacturer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	onlyMissing := r.URL.Query().Get("only_missing") != "false"

	limit := 500
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
			if limit > 5000 {
				limit = 5000
			}
		}
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	if len(category) > 50 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category too long (max 50)"})
		return
	}

	probe := r.URL.Query().Get("probe") == "true" || r.URL.Query().Get("probe") == "1"

	if !app.enrichGuard.tryStart() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "enrich job already in progress"})
		return
	}

	go func() {
		defer app.enrichGuard.finish()
		sum := app.runEnrichXKOMManufacturer(onlyMissing, category, limit, probe)
		log.Printf("[enrich/x-kom-mfr] completed: %+v", sum)
	}()

	resp := map[string]interface{}{
		"status":       "x-kom manufacturer enrich started",
		"only_missing": onlyMissing,
		"limit":        limit,
		"probe":        probe,
	}
	if category != "" {
		resp["category"] = category
	}
	writeJSON(w, http.StatusAccepted, resp)
}

