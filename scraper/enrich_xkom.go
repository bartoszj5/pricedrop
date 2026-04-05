package main

import (
	"log"
	"strings"
	"time"
)

// EnrichXKSummary is logged after an x-kom manufacturer-code enrich job.
type EnrichXKSummary struct {
	Total         int   `json:"total"`
	Updated       int   `json:"updated"`
	SkippedNoCode int   `json:"skipped_no_code"`
	Errors        int   `json:"errors"`
	Probe         bool  `json:"probe"`
	DurationMs    int64 `json:"duration_ms"`
}

func (app *App) runEnrichXKOMManufacturer(onlyMissing bool, category string, limit int, probe bool) EnrichXKSummary {
	start := time.Now()
	sum := EnrichXKSummary{Probe: probe}

	var scraper StoreScraper
	if probe {
		scraper = NewXKomScraper(app.config.UserAgent, 0)
	} else {
		var err error
		scraper, err = app.registry.Get("x-kom")
		if err != nil {
			log.Printf("[enrich/x-kom-mfr] scraper: %v", err)
			sum.Errors++
			sum.DurationMs = time.Since(start).Milliseconds()
			return sum
		}
	}

	rows, err := app.db.ListProductsForXKOMManufacturerEnrich(onlyMissing, category, limit)
	if err != nil {
		log.Printf("[enrich/x-kom-mfr] list: %v", err)
		sum.Errors++
		sum.DurationMs = time.Since(start).Milliseconds()
		return sum
	}

	sum.Total = len(rows)
	for _, row := range rows {
		scraped, err := scraper.ScrapeProduct(row.URL)
		if err != nil {
			log.Printf("[enrich/x-kom-mfr] product %d scrape %s: %v", row.ID, row.URL, err)
			sum.Errors++
			continue
		}
		code := strings.TrimSpace(scraped.ManufacturerCode)
		if code == "" {
			sum.SkippedNoCode++
			continue
		}
		if err := app.db.SetProductManufacturerCode(row.ID, code); err != nil {
			log.Printf("[enrich/x-kom-mfr] product %d db: %v", row.ID, err)
			sum.Errors++
			continue
		}
		sum.Updated++
		log.Printf("[enrich/x-kom-mfr] product %d: manufacturer_code=%q", row.ID, code)
	}

	sum.DurationMs = time.Since(start).Milliseconds()
	return sum
}
