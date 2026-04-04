package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type App struct {
	config          Config
	db              *DB
	registry        *ScraperRegistry
	crawlerRegistry *CrawlerRegistry
	mu              sync.Mutex
	running         bool
	crawlMu         sync.Mutex
	crawlRunning    bool
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

	app := &App{
		config:          cfg,
		db:              db,
		registry:        registry,
		crawlerRegistry: crawlerRegistry,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.handleHealth)
	mux.HandleFunc("/scrape/test", app.handleScrapeTest)
	mux.HandleFunc("/scrape", app.handleScrape)
	mux.HandleFunc("/scrape/", app.handleScrapeStore)
	mux.HandleFunc("/crawl", app.handleCrawl)
	mux.HandleFunc("/crawl/", app.handleCrawlStore)

	log.Printf("Scraper listening on :%s", cfg.Port)
	log.Printf("Registered scrapers: %v", registry.RegisteredSlugs())
	log.Printf("Registered crawlers: %v", crawlerRegistry.RegisteredSlugs())
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
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

	if !app.tryStartScrape() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "scrape already in progress"})
		return
	}

	go func() {
		defer app.finishScrape()
		results := app.scrapeAllStores()
		log.Printf("Scrape all completed: %+v", results)
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

	if !app.tryStartScrape() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "scrape already in progress"})
		return
	}

	go func() {
		defer app.finishScrape()
		result := app.scrapeStore(storeSlug)
		log.Printf("Scrape %s completed: %+v", storeSlug, result)
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

		log.Printf("[%s] %s: %.2f %s (was %.2f), available=%v",
			storeSlug, p.ProductTitle, scraped.Price, scraped.Currency, p.CurrentPrice, scraped.IsAvailable)

		// Round to 2 decimal places for comparison.
		newPrice := math.Round(scraped.Price*100) / 100
		oldPrice := math.Round(p.CurrentPrice*100) / 100

		changed, err := app.db.UpdatePrice(p.ID, oldPrice, newPrice, scraped.Currency, scraped.IsAvailable)
		if err != nil {
			log.Printf("[%s] Error updating price for %s: %v", storeSlug, p.ProductTitle, err)
			result.Errors++
			continue
		}

		if changed {
			log.Printf("[%s] Price changed for %s: %.2f -> %.2f", storeSlug, p.ProductTitle, oldPrice, newPrice)
			result.Updated++
		} else {
			result.Unchanged++
		}
	}

	result.DurationMillis = time.Since(start).Milliseconds()
	return result
}

func (app *App) tryStartScrape() bool {
	app.mu.Lock()
	defer app.mu.Unlock()
	if app.running {
		return false
	}
	app.running = true
	return true
}

func (app *App) finishScrape() {
	app.mu.Lock()
	defer app.mu.Unlock()
	app.running = false
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

// handleCrawl triggers crawling for all registered stores.
// POST /crawl
func (app *App) handleCrawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !app.tryStartCrawl() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "crawl already in progress"})
		return
	}

	go func() {
		defer app.finishCrawl()
		var allResults []CrawlCategoryResult
		for _, slug := range app.crawlerRegistry.RegisteredSlugs() {
			results := app.crawlStoreAllCategories(slug, defaultCrawlMaxPages)
			allResults = append(allResults, results...)
		}
		log.Printf("Crawl all completed: %d category results", len(allResults))
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

	if !app.tryStartCrawl() {
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
		defer app.finishCrawl()

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
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{
		"status": "crawl started",
		"store":  storeSlug,
	})
}

func (app *App) tryStartCrawl() bool {
	app.crawlMu.Lock()
	defer app.crawlMu.Unlock()
	if app.crawlRunning {
		return false
	}
	app.crawlRunning = true
	return true
}

func (app *App) finishCrawl() {
	app.crawlMu.Lock()
	defer app.crawlMu.Unlock()
	app.crawlRunning = false
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
		err = app.db.UpsertProductAndPrice(cleanTitle, productSlug, category, imageURL, store.ID, price, currency, dp.URL)
		if err != nil {
			log.Printf("[crawl/%s] Error upserting %s: %v", storeSlug, title, err)
			result.Errors++
			continue
		}

		log.Printf("[crawl/%s] NEW: %s (%.2f %s)", storeSlug, title, price, currency)
		result.New++
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
