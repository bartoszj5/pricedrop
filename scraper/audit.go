package main

import (
	"context"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultAuditMinScore = 0.55
	defaultAuditLimit    = 500
	maxAuditLimit        = 10000
	auditEmbedTimeout    = 60 * time.Second
	auditEmbedWorkers    = 3
)

// AuditItem is one suspicious (product, offer) pair flagged by the title audit.
type AuditItem struct {
	ProductID    int     `json:"product_id"`
	ProductTitle string  `json:"product_title"`
	PriceID      int     `json:"price_id"`
	StoreSlug    string  `json:"store_slug"`
	StoreName    string  `json:"store_name"`
	StoreTitle   string  `json:"store_title"`
	URL          string  `json:"url"`
	CurrentPrice float64 `json:"current_price"`
	Score        float64 `json:"score"`
}

// AuditSummary is the response body for /audit/titles.
type AuditSummary struct {
	MinScore          float64     `json:"min_score"`
	Store             string      `json:"store,omitempty"`
	Category          string      `json:"category,omitempty"`
	ProductsChecked   int         `json:"products_checked"`
	OffersChecked     int         `json:"offers_checked"`
	SuspiciousCount   int         `json:"suspicious_count"`
	EmbeddingsUsed    bool        `json:"embeddings_used"`
	UniqueTexts       int         `json:"unique_texts"`
	DurationMs        int64       `json:"duration_ms"`
	Items             []AuditItem `json:"items"`
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

	// Collect unique titles across every group — each text embedded at most once.
	textIndex := make(map[string]int)
	texts := make([]string, 0)
	addText := func(t string) {
		t = strings.TrimSpace(t)
		if t == "" {
			return
		}
		if _, ok := textIndex[t]; ok {
			return
		}
		textIndex[t] = len(texts)
		texts = append(texts, t)
	}
	offersChecked := 0
	for _, g := range groups {
		addText(g.ProductTitle)
		for _, c := range g.Candidates {
			addText(c.StoreTitle)
			offersChecked++
		}
	}

	vectors, embedOK := auditEmbedAll(texts)

	items := make([]AuditItem, 0)
	for _, g := range groups {
		pi, pOK := textIndex[strings.TrimSpace(g.ProductTitle)]
		var pVec []float64
		if embedOK && pOK {
			pVec = vectors[pi]
		}
		for _, c := range g.Candidates {
			storeT := strings.TrimSpace(c.StoreTitle)
			score := titleTokenJaccard(g.ProductTitle, storeT)
			if pVec != nil {
				if ci, ok := textIndex[storeT]; ok {
					if cVec := vectors[ci]; cVec != nil {
						cs := cosine(pVec, cVec)
						if cs > score {
							score = cs
						}
					}
				}
			}
			if score >= minScore {
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
				Score:        score,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool { return items[i].Score < items[j].Score })

	suspicious := len(items)
	if limit > 0 && suspicious > limit {
		items = items[:limit]
	}

	resp := AuditSummary{
		MinScore:        minScore,
		Store:           storeSlug,
		Category:        category,
		ProductsChecked: len(groups),
		OffersChecked:   offersChecked,
		SuspiciousCount: suspicious,
		EmbeddingsUsed:  embedOK,
		UniqueTexts:     len(texts),
		DurationMs:      time.Since(start).Milliseconds(),
		Items:           items,
	}
	log.Printf("[audit/titles] store=%q category=%q min_score=%.2f products=%d offers=%d unique=%d embed_used=%v suspicious=%d (%dms)",
		storeSlug, category, minScore, len(groups), offersChecked, len(texts), embedOK, suspicious, resp.DurationMs)
	writeJSON(w, http.StatusOK, resp)
}

// auditEmbedAll embeds every text in parallel pages of EmbeddingsBatchLimit.
// Returns the filled vectors slice (same length/order as texts) and a bool
// indicating whether the overall embed succeeded. On partial failure returns
// (vectors, false) so caller knows to fall back to Jaccard.
func auditEmbedAll(texts []string) ([][]float64, bool) {
	vectors := make([][]float64, len(texts))
	if embeddingsClient == nil || len(texts) == 0 {
		return vectors, false
	}

	type page struct{ start, end int }
	pages := make([]page, 0, (len(texts)+EmbeddingsBatchLimit-1)/EmbeddingsBatchLimit)
	for i := 0; i < len(texts); i += EmbeddingsBatchLimit {
		end := i + EmbeddingsBatchLimit
		if end > len(texts) {
			end = len(texts)
		}
		pages = append(pages, page{i, end})
	}

	jobs := make(chan page, len(pages))
	for _, p := range pages {
		jobs <- p
	}
	close(jobs)

	var (
		wg      sync.WaitGroup
		failed  int32
		mu      sync.Mutex
	)
	workers := auditEmbedWorkers
	if workers > len(pages) {
		workers = len(pages)
	}
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range jobs {
				ctx, cancel := context.WithTimeout(context.Background(), auditEmbedTimeout)
				vecs, err := embeddingsClient.Embed(ctx, texts[p.start:p.end], auditEmbedTimeout)
				cancel()
				if err != nil {
					mu.Lock()
					failed++
					mu.Unlock()
					log.Printf("[audit/titles] embed page %d-%d failed: %v", p.start, p.end, err)
					continue
				}
				for i, v := range vecs {
					vectors[p.start+i] = v
				}
			}
		}()
	}
	wg.Wait()

	return vectors, failed == 0
}

// cosine returns the dot product of two equal-length normalised vectors,
// clamped to [0, 1]. Embeddings service returns unit-normalised vectors,
// so dot == cosine similarity.
func cosine(a, b []float64) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var s float64
	for i := range a {
		s += a[i] * b[i]
	}
	if s < 0 {
		return 0
	}
	if s > 1 {
		return 1
	}
	return s
}
