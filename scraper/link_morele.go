package main

import (
	"log"
	"net/url"
	"strings"
	"time"
)

func hitShowsManufacturerCode(hit *MoreleSearchHit, code string) bool {
	c := normalizeMfrKey(code)
	if len(c) < 4 {
		return false
	}
	hay := normalizeMfrKey(hit.Title + moreleURLStem(hit.URL))
	return strings.Contains(hay, c)
}

// moreleURLStem derives a rough title from a Morele product path when link text is empty.
func moreleURLStem(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	path := strings.Trim(u.Path, "/")
	if path == "" {
		return ""
	}
	// Single segment URL: foo-bar-12345678
	if i := strings.LastIndex(path, "/"); i >= 0 {
		path = path[i+1:]
	}
	// Drop trailing -digits (Morele product id).
	for {
		h := strings.LastIndex(path, "-")
		if h < 0 {
			break
		}
		tail := path[h+1:]
		allNum := true
		for _, r := range tail {
			if r < '0' || r > '9' {
				allNum = false
				break
			}
		}
		if !allNum || tail == "" {
			break
		}
		path = path[:h]
	}
	path = strings.ReplaceAll(path, "-", " ")
	return strings.TrimSpace(path)
}

func pickBestMoreleHit(productTitle, manufacturerCode string, hits []MoreleSearchHit) (best MoreleSearchHit, score float64, ok bool) {
	code := strings.TrimSpace(manufacturerCode)
	pool := hits
	if code != "" {
		var filtered []MoreleSearchHit
		for i := range hits {
			if hitShowsManufacturerCode(&hits[i], code) {
				filtered = append(filtered, hits[i])
			}
		}
		if len(filtered) > 0 {
			pool = filtered
		}
	}
	if len(pool) == 0 {
		return MoreleSearchHit{}, 0, false
	}

	candidates := make([]string, len(pool))
	for i := range pool {
		t := strings.TrimSpace(pool[i].Title)
		if t == "" {
			t = moreleURLStem(pool[i].URL)
		}
		candidates[i] = t
	}
	scores := titleSimilarityScores(productTitle, candidates)

	var top *MoreleSearchHit
	topScore := 0.0
	for i := range pool {
		s := scores[i]
		if code != "" && hitShowsManufacturerCode(&pool[i], code) && s < 0.50 {
			s = 0.50
		}
		if s > topScore {
			topScore = s
			top = &pool[i]
		}
	}
	if top == nil {
		return MoreleSearchHit{}, 0, false
	}
	return *top, topScore, true
}

func (app *App) runLinkMorele(sourceStoreSlug, productCategory string, limit int, minScore float64, maxSearchHits int, dryRun, probe bool) LinkSummary {
	start := time.Now()
	sum := LinkSummary{DryRun: dryRun, Probe: probe}

	moreleStore, err := app.db.GetStoreBySlug("morele")
	if err != nil {
		log.Printf("[link/morele] store morele: %v", err)
		sum.Errors++
		sum.DurationMs = time.Since(start).Milliseconds()
		return sum
	}

	var scraper StoreScraper
	if probe {
		scraper = NewMoreleScraper(app.config.UserAgent, 0)
	} else {
		var gerr error
		scraper, gerr = app.registry.Get("morele")
		if gerr != nil {
			log.Printf("[link/morele] scraper: %v", gerr)
			sum.Errors++
			sum.DurationMs = time.Since(start).Milliseconds()
			return sum
		}
	}

	searchDelay := app.config.MoreleSearchDelay
	if probe {
		searchDelay = 0
	}

	products, err := app.db.ListProductsWithSourceWithoutTargetStore(sourceStoreSlug, "morele", productCategory, limit)
	if err != nil {
		log.Printf("[link/morele] list products: %v", err)
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

		var hits []MoreleSearchHit
		var lastSearchErr error
		for _, q := range queries {
			h, err := SearchMorele(app.config.UserAgent, searchDelay, q, maxSearchHits)
			if err != nil {
				lastSearchErr = err
				log.Printf("[link/morele] search %q (product %d): %v", q, pr.ID, err)
				continue
			}
			if len(h) > 0 {
				hits = h
				break
			}
		}
		if len(hits) == 0 {
			if lastSearchErr != nil {
				sum.Errors++
			} else {
				sum.NoSearchHits++
			}
			continue
		}

		best, score, ok := pickBestMoreleHit(pr.Title, pr.ManufacturerCode, hits)
		if !ok || score < minScore {
			sum.SkippedLowScore++
			log.Printf("[link/morele] product %d: best score %.3f < %.3f — skip", pr.ID, score, minScore)
			continue
		}

		if dryRun {
			sum.Linked++
			log.Printf("[link/morele] DRY product %d: would link score=%.3f url=%s", pr.ID, score, best.URL)
			continue
		}

		scraped, err := scraper.ScrapeProduct(best.URL)
		if err != nil {
			log.Printf("[link/morele] scrape %s (product %d): %v", best.URL, pr.ID, err)
			sum.Errors++
			continue
		}

		linkVerifyAndUpsert(app, &sum, "morele", pr, moreleStore.ID, scraped, best.URL, score)
	}

	sum.DurationMs = time.Since(start).Milliseconds()
	return sum
}
