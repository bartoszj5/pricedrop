package main

import (
	"log"
	"math"
	"strings"
)

const defaultSearchQueryMaxLen = 120

// ProductToLink is a row from ListProductsWithSourceWithoutTargetStore.
type ProductToLink struct {
	ID               int
	Title            string
	ManufacturerCode string
	SourceURL        string
	SourcePrice      float64
}

// LinkSummary is the unified result type for all link jobs (morele, mediaexpert, amazon).
type LinkSummary struct {
	Processed          int   `json:"processed"`
	Linked             int   `json:"linked"`
	SkippedLowScore    int   `json:"skipped_low_score"`
	SkippedMfrMismatch int   `json:"skipped_mfr_mismatch"`
	SkippedNoPrice     int   `json:"skipped_no_price,omitempty"`
	SkippedPriceRatio  int   `json:"skipped_price_ratio,omitempty"`
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

// maxLinkPriceRatio is the maximum allowed ratio between source and target price.
// If the source price is 5x or more than the target price (or vice versa), the match is rejected.
const maxLinkPriceRatio = 5.0

// linkVerifyAndUpsert checks manufacturer code compatibility, price sanity, rounds the price, and upserts.
// Returns true if the price was upserted, false if skipped or failed (sum is updated accordingly).
func linkVerifyAndUpsert(app *App, sum *LinkSummary, storeName string, pr ProductToLink, storeID int, scraped *ScrapeResult, productURL string, score float64) bool {
	if want := manufacturerCodeForLinking(pr.ManufacturerCode); want != "" {
		got := strings.TrimSpace(scraped.ManufacturerCode)
		if got != "" && !manufacturerCodesCompatible(want, got) {
			sum.SkippedMfrMismatch++
			log.Printf("[link/%s] product %d: MPN mismatch ours=%q %s=%q — skip", storeName, pr.ID, want, storeName, got)
			return false
		}
	}

	newPrice := math.Round(scraped.Price*100) / 100

	// Price ratio sanity check: reject if source and target prices differ by more than 5x.
	if pr.SourcePrice > 0 && newPrice > 0 {
		ratio := pr.SourcePrice / newPrice
		if ratio < 1 {
			ratio = 1 / ratio
		}
		if ratio > maxLinkPriceRatio {
			sum.SkippedPriceRatio++
			log.Printf("[link/%s] product %d: price ratio %.1fx (source=%.2f target=%.2f) exceeds %.0fx — skip", storeName, pr.ID, ratio, pr.SourcePrice, newPrice, maxLinkPriceRatio)
			return false
		}
	}
	currency := scraped.Currency
	if currency == "" {
		currency = "PLN"
	}

	if err := app.db.UpsertPriceForProduct(pr.ID, storeID, newPrice, currency, productURL, scraped.IsAvailable); err != nil {
		log.Printf("[link/%s] upsert price product %d: %v", storeName, pr.ID, err)
		sum.Errors++
		return false
	}

	sum.Linked++
	log.Printf("[link/%s] product %d: linked score=%.3f price=%.2f %s url=%s", storeName, pr.ID, score, newPrice, currency, productURL)
	return true
}
