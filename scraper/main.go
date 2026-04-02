package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

type App struct {
	config   Config
	db       *DB
	registry *ScraperRegistry
	mu       sync.Mutex
	running  bool
}

func main() {
	cfg := LoadConfig()

	db, err := NewDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	registry := NewScraperRegistry()
	registry.Register("x-kom", NewXKomScraper(cfg.UserAgent, cfg.RequestDelay))
	registry.Register("mediaexpert", NewMediaExpertScraper(cfg.UserAgent, cfg.RequestDelay))

	app := &App{
		config:   cfg,
		db:       db,
		registry: registry,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.handleHealth)
	mux.HandleFunc("/scrape/test", app.handleScrapeTest)
	mux.HandleFunc("/scrape", app.handleScrape)
	mux.HandleFunc("/scrape/", app.handleScrapeStore)

	log.Printf("Scraper listening on :%s", cfg.Port)
	log.Printf("Registered scrapers: %v", registry.RegisteredSlugs())
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

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
