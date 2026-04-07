package main

import (
	"log"
	"math"
	"net/url"
	"strings"
	"time"
)

const defaultSearchQueryMaxLen = 120

// ProductToLink is a row from ListProductsWithSourceWithoutTargetStore.
type ProductToLink struct {
	ID               int
	Title            string
	ManufacturerCode string
	SourceURL        string
}

// LinkMoreleSummary is returned after a link-morele job.
type LinkMoreleSummary struct {
	Processed          int   `json:"processed"`
	Linked             int   `json:"linked"`
	SkippedLowScore    int   `json:"skipped_low_score"`
	SkippedMfrMismatch int   `json:"skipped_mfr_mismatch"`
	NoSearchHits       int   `json:"no_search_hits"`
	Errors             int   `json:"errors"`
	DryRun             bool  `json:"dry_run"`
	Probe              bool  `json:"probe"`
	DurationMs         int64 `json:"duration_ms"`
}

var stripTitleNoise = strings.NewReplacer(
	"\u2122", "", // ™
	"\u00ae", "", // ®
	"\u00a9", "", // ©
	"\u00a0", " ", // NBSP
)

// stripTrademarkSymbols removes ™, ®, © and NBSP for search queries and token matching.
func stripTrademarkSymbols(s string) string {
	s = stripTitleNoise.Replace(s)
	return strings.TrimSpace(s)
}

func truncateSearchQuery(title string, maxLen int) string {
	title = stripTrademarkSymbols(strings.TrimSpace(title))
	if maxLen <= 0 {
		maxLen = defaultSearchQueryMaxLen
	}
	if len(title) <= maxLen {
		return title
	}
	cut := title[:maxLen]
	if i := strings.LastIndexByte(cut, ' '); i > 40 {
		return strings.TrimSpace(cut[:i])
	}
	return strings.TrimSpace(cut)
}

// normalizeMfrKey keeps only a-z0-9 for comparing manufacturer / MPN strings.
func normalizeMfrKey(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func manufacturerCodesCompatible(a, b string) bool {
	a, b = normalizeMfrKey(a), normalizeMfrKey(b)
	if a == "" || b == "" {
		return true
	}
	if a == b {
		return true
	}
	if len(a) >= 4 && strings.Contains(b, a) {
		return true
	}
	if len(b) >= 4 && strings.Contains(a, b) {
		return true
	}
	return false
}

func hitShowsManufacturerCode(hit *MoreleSearchHit, code string) bool {
	c := normalizeMfrKey(code)
	if len(c) < 4 {
		return false
	}
	hay := normalizeMfrKey(hit.Title + moreleURLStem(hit.URL))
	return strings.Contains(hay, c)
}

// productTitleForLinking returns the product title cleaned up for fuzzy matching.
func productTitleForLinking(sourceStoreSlug string, pr ProductToLink) string {
	return strings.TrimSpace(pr.Title)
}

// manufacturerCodeForLinking normalises a manufacturer code for comparison during linking.
func manufacturerCodeForLinking(code string) string {
	return strings.TrimSpace(code)
}

func searchQueriesForProduct(sourceStoreSlug string, pr ProductToLink) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(q string) {
		q = strings.TrimSpace(q)
		if q == "" {
			return
		}
		if len(q) > defaultSearchQueryMaxLen {
			if i := strings.LastIndexByte(q[:defaultSearchQueryMaxLen], ' '); i > 20 {
				q = q[:i]
			} else {
				q = q[:defaultSearchQueryMaxLen]
			}
		}
		if _, ok := seen[q]; ok {
			return
		}
		seen[q] = struct{}{}
		out = append(out, q)
	}
	add(stripTrademarkSymbols(pr.ManufacturerCode))
	add(truncateSearchQuery(pr.Title, defaultSearchQueryMaxLen))
	return out
}

func titleTokens(s string) map[string]struct{} {
	s = stripTrademarkSymbols(strings.TrimSpace(s))
	if s == "" {
		return nil
	}
	s = cleanProductTitle(normalizeTitle(s))
	s = strings.ToLower(diacriticReplacer.Replace(s))
	parts := nonAlphanumRegex.Split(s, -1)
	out := make(map[string]struct{})
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if len(p) < 2 {
			continue
		}
		out[p] = struct{}{}
	}
	return out
}

// titleTokenJaccard compares two product titles (0..1). Higher = more similar token overlap.
func titleTokenJaccard(a, b string) float64 {
	A := titleTokens(a)
	B := titleTokens(b)
	if len(A) == 0 || len(B) == 0 {
		return 0
	}
	inter := 0
	for t := range A {
		if _, ok := B[t]; ok {
			inter++
		}
	}
	union := len(A) + len(B) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
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

	var top *MoreleSearchHit
	topScore := 0.0
	for i := range pool {
		h := &pool[i]
		candidate := strings.TrimSpace(h.Title)
		if candidate == "" {
			candidate = moreleURLStem(h.URL)
		}
		s := titleTokenJaccard(productTitle, candidate)
		if code != "" && hitShowsManufacturerCode(h, code) && s < 0.42 {
			s = 0.42
		}
		if s > topScore {
			topScore = s
			top = h
		}
	}
	if top == nil {
		return MoreleSearchHit{}, 0, false
	}
	return *top, topScore, true
}

func (app *App) runLinkMorele(sourceStoreSlug, productCategory string, limit int, minScore float64, maxSearchHits int, dryRun, probe bool) LinkMoreleSummary {
	start := time.Now()
	sum := LinkMoreleSummary{DryRun: dryRun, Probe: probe}

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

		if want := strings.TrimSpace(pr.ManufacturerCode); want != "" {
			got := strings.TrimSpace(scraped.ManufacturerCode)
			if got != "" && !manufacturerCodesCompatible(want, got) {
				sum.SkippedMfrMismatch++
				log.Printf("[link/morele] product %d: MPN mismatch ours=%q morele=%q — skip", pr.ID, want, got)
				continue
			}
		}

		newPrice := math.Round(scraped.Price*100) / 100
		currency := scraped.Currency
		if currency == "" {
			currency = "PLN"
		}

		if err := app.db.UpsertPriceForProduct(pr.ID, moreleStore.ID, newPrice, currency, best.URL, scraped.IsAvailable); err != nil {
			log.Printf("[link/morele] upsert price product %d: %v", pr.ID, err)
			sum.Errors++
			continue
		}

		sum.Linked++
		log.Printf("[link/morele] product %d: linked score=%.3f price=%.2f %s url=%s", pr.ID, score, newPrice, currency, best.URL)
	}

	sum.DurationMs = time.Since(start).Milliseconds()
	return sum
}
