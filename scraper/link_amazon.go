package main

import (
	"errors"
	"log"
	"math"
	"strings"
	"time"
)

// LinkAmazonSummary is returned after a link-amazon job.
type LinkAmazonSummary struct {
	Processed          int   `json:"processed"`
	Linked             int   `json:"linked"`
	SkippedLowScore    int   `json:"skipped_low_score"`
	SkippedMfrMismatch int   `json:"skipped_mfr_mismatch"`
	SkippedNoPrice     int   `json:"skipped_no_price"`
	NoSearchHits       int   `json:"no_search_hits"`
	Errors             int   `json:"errors"`
	DryRun             bool  `json:"dry_run"`
	Probe              bool  `json:"probe"`
	DurationMs         int64 `json:"duration_ms"`
}

func amazonTargetStoreSlugInDB(app *App) (slug string, store *Store, err error) {
	st, e := app.db.GetStoreBySlug("amazon")
	if e == nil {
		return "amazon", st, nil
	}
	return "", nil, errors.New("no Amazon store row (slug amazon)")
}

func (app *App) runLinkAmazon(sourceStoreSlug, productCategory string, limit int, minScore float64, maxSearchHits int, dryRun, probe bool) LinkAmazonSummary {
	start := time.Now()
	sum := LinkAmazonSummary{DryRun: dryRun, Probe: probe}

	targetSlug, amazonStore, err := amazonTargetStoreSlugInDB(app)
	if err != nil {
		log.Printf("[link/amazon] store: %v", err)
		sum.Errors++
		sum.DurationMs = time.Since(start).Milliseconds()
		return sum
	}

	var scraper StoreScraper
	if probe {
		scraper = NewAmazonScraper(app.config.UserAgent, 0)
	} else {
		var gerr error
		scraper, gerr = app.registry.Get("amazon")
		if gerr != nil {
			log.Printf("[link/amazon] scraper: %v", gerr)
			sum.Errors++
			sum.DurationMs = time.Since(start).Milliseconds()
			return sum
		}
	}

	searchDelay := app.config.AmazonSearchDelay
	if probe {
		searchDelay = 0
	}

	products, err := app.db.ListProductsWithSourceWithoutTargetStore(sourceStoreSlug, targetSlug, productCategory, limit)
	if err != nil {
		log.Printf("[link/amazon] list products: %v", err)
		sum.Errors++
		sum.DurationMs = time.Since(start).Milliseconds()
		return sum
	}

	for _, pr := range products {
		sum.Processed++
		queries := searchQueriesForProduct(sourceStoreSlug, pr)
		if len(queries) == 0 {
			sum.Errors++
			continue
		}

		var best AmazonSearchHit
		var score float64
		var picked bool
		var lastSearchErr error
		anyResults := false
		linkTitle := productTitleForLinking(sourceStoreSlug, pr)
		for _, q := range queries {
			h, err := SearchAmazon(app.config.UserAgent, searchDelay, q, maxSearchHits)
			if err != nil {
				lastSearchErr = err
				log.Printf("[link/amazon] search %q (product %d): %v", q, pr.ID, err)
				continue
			}
			if len(h) == 0 {
				continue
			}
			anyResults = true
			b, s, ok := pickBestAmazonHit(linkTitle, manufacturerCodeForLinking(pr.ManufacturerCode), h, q)
			if !ok || s < minScore {
				continue
			}
			if !amazonHitPassesMfrTitleGuard(manufacturerCodeForLinking(pr.ManufacturerCode), &b, s) {
				log.Printf("[link/amazon] product %d: query %q hit %q score=%.3f — MPN not in title and score < %.2f — try next query", pr.ID, q, b.Title, s, amazonMinScoreWhenMfrNotInHit)
				continue
			}
			best, score, picked = b, s, true
			break
		}
		if !picked {
			if lastSearchErr != nil {
				sum.Errors++
			} else if !anyResults {
				sum.NoSearchHits++
			} else {
				sum.SkippedLowScore++
				log.Printf("[link/amazon] product %d: no acceptable hit across queries (min_score=%.3f)", pr.ID, minScore)
			}
			continue
		}

		if dryRun {
			sum.Linked++
			log.Printf("[link/amazon] DRY product %d: would link score=%.3f url=%s", pr.ID, score, best.URL)
			continue
		}

		scraped, err := scraper.ScrapeProduct(best.URL)
		if err != nil {
			if errors.Is(err, ErrAmazonNoBuyBoxPrice) {
				sum.SkippedNoPrice++
				log.Printf("[link/amazon] product %d: skip link — %v (%s)", pr.ID, err, best.URL)
				continue
			}
			log.Printf("[link/amazon] scrape %s (product %d): %v", best.URL, pr.ID, err)
			sum.Errors++
			continue
		}

		if want := manufacturerCodeForLinking(pr.ManufacturerCode); want != "" {
			got := strings.TrimSpace(scraped.ManufacturerCode)
			if got != "" && !manufacturerCodesCompatible(want, got) {
				sum.SkippedMfrMismatch++
				log.Printf("[link/amazon] product %d: MPN mismatch ours=%q amazon=%q — skip", pr.ID, want, got)
				continue
			}
		}

		newPrice := math.Round(scraped.Price*100) / 100
		currency := scraped.Currency
		if currency == "" {
			currency = "PLN"
		}

		if err := app.db.UpsertPriceForProduct(pr.ID, amazonStore.ID, newPrice, currency, best.URL, scraped.IsAvailable); err != nil {
			log.Printf("[link/amazon] upsert price product %d: %v", pr.ID, err)
			sum.Errors++
			continue
		}

		sum.Linked++
		log.Printf("[link/amazon] product %d: linked score=%.3f price=%.2f %s url=%s", pr.ID, score, newPrice, currency, best.URL)
	}

	sum.DurationMs = time.Since(start).Milliseconds()
	return sum
}
