package main

import (
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAuditMinScore = 0.55
	defaultAuditLimit    = 500
	maxAuditLimit        = 10000
)

// AuditItem is one suspicious (product, offer) pair flagged by the title audit.
type AuditItem struct {
	ProductID     int     `json:"product_id"`
	ProductTitle  string  `json:"product_title"`
	PriceID       int     `json:"price_id"`
	StoreSlug     string  `json:"store_slug"`
	StoreName     string  `json:"store_name"`
	StoreTitle    string  `json:"store_title"`
	URL           string  `json:"url"`
	CurrentPrice  float64 `json:"current_price"`
	Score         float64 `json:"score"`
}

// AuditSummary is the response body for /audit/titles.
type AuditSummary struct {
	MinScore           float64     `json:"min_score"`
	Store              string      `json:"store,omitempty"`
	Category           string      `json:"category,omitempty"`
	ProductsChecked    int         `json:"products_checked"`
	OffersChecked      int         `json:"offers_checked"`
	SuspiciousCount    int         `json:"suspicious_count"`
	EmbeddingsEnabled  bool        `json:"embeddings_enabled"`
	DurationMs         int64       `json:"duration_ms"`
	Items              []AuditItem `json:"items"`
}

// handleAuditTitles scans price rows and flags offers whose scraped store_title
// poorly matches the canonical product.title. Read-only — no DB writes.
//
// GET /audit/titles?store=x-kom&category=smartphones&min_score=0.55&limit=500
func (app *App) handleAuditTitles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	q := r.URL.Query()
	storeSlug := strings.TrimSpace(q.Get("store"))
	category := strings.TrimSpace(q.Get("category"))
	if len(category) > 50 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category too long (max 50)"})
		return
	}

	minScore := defaultAuditMinScore
	if v := q.Get("min_score"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 1 {
			minScore = f
		}
	}

	limit := defaultAuditLimit
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			if n == 0 {
				limit = 0
			} else if n > 0 {
				limit = n
				if limit > maxAuditLimit {
					limit = maxAuditLimit
				}
			}
		}
	}

	if storeSlug != "" {
		if _, err := app.db.GetStoreBySlug(storeSlug); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown store: " + storeSlug})
			return
		}
	}

	start := time.Now()
	groups, err := app.db.GetPricesForAudit(storeSlug, category)
	if err != nil {
		log.Printf("[audit/titles] db error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db error"})
		return
	}

	items := make([]AuditItem, 0)
	offersChecked := 0
	for _, g := range groups {
		if len(g.Candidates) == 0 {
			continue
		}
		offersChecked += len(g.Candidates)

		titles := make([]string, len(g.Candidates))
		for i, c := range g.Candidates {
			titles[i] = c.StoreTitle
		}
		scores := titleSimilarityScores(g.ProductTitle, titles)

		for i, c := range g.Candidates {
			if scores[i] >= minScore {
				continue
			}
			items = append(items, AuditItem{
				ProductID:    g.ProductID,
				ProductTitle: g.ProductTitle,
				PriceID:      c.PriceID,
				StoreSlug:    c.StoreSlug,
				StoreName:    c.StoreName,
				StoreTitle:   c.StoreTitle,
				URL:          c.URL,
				CurrentPrice: c.CurrentPrice,
				Score:        scores[i],
			})
		}
	}

	sort.Slice(items, func(i, j int) bool { return items[i].Score < items[j].Score })

	suspicious := len(items)
	if limit > 0 && suspicious > limit {
		items = items[:limit]
	}

	resp := AuditSummary{
		MinScore:          minScore,
		Store:             storeSlug,
		Category:          category,
		ProductsChecked:   len(groups),
		OffersChecked:     offersChecked,
		SuspiciousCount:   suspicious,
		EmbeddingsEnabled: embeddingsClient != nil,
		DurationMs:        time.Since(start).Milliseconds(),
		Items:             items,
	}
	log.Printf("[audit/titles] store=%q category=%q min_score=%.2f products=%d offers=%d suspicious=%d (%dms)",
		storeSlug, category, minScore, len(groups), offersChecked, suspicious, resp.DurationMs)
	writeJSON(w, http.StatusOK, resp)
}
