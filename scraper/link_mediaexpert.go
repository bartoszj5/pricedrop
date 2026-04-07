package main

import (
	"errors"
	"log"
	"math"
	neturl "net/url"
	"strings"
	"time"
)

// LinkMediaExpertSummary is returned after a link-mediaexpert job.
type LinkMediaExpertSummary struct {
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

// mediaExpertAbsoluteURL turns a Synerise link field into an absolute product URL.
func mediaExpertAbsoluteURL(link string) string {
	link = strings.TrimSpace(link)
	if link == "" {
		return ""
	}
	if strings.HasPrefix(link, "http://") || strings.HasPrefix(link, "https://") {
		return link
	}
	if strings.HasPrefix(link, "//") {
		return "https:" + link
	}
	return "https://www.mediaexpert.pl" + link
}

// mediaExpertURLStem derives searchable text from a Media Expert product path (slug).
func mediaExpertURLStem(raw string) string {
	u, err := neturl.Parse(raw)
	if err != nil {
		return ""
	}
	p := strings.Trim(u.Path, "/")
	if p == "" {
		return ""
	}
	if i := strings.LastIndex(p, "/"); i >= 0 {
		p = p[i+1:]
	}
	p = strings.TrimSuffix(strings.TrimSpace(p), ".html")
	for {
		h := strings.LastIndex(p, "-")
		if h < 0 {
			break
		}
		tail := p[h+1:]
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
		p = p[:h]
	}
	p = strings.ReplaceAll(p, "-", " ")
	return strings.TrimSpace(p)
}

// mediaExpertHitCandidateTitle prefers the main title; falls back to Synerise display_ads_title or URL stem.
func mediaExpertHitCandidateTitle(h *mediaExpertSearchItem) string {
	if t := strings.TrimSpace(h.Title); t != "" {
		return t
	}
	if h.Attributes != nil {
		if v := strings.TrimSpace(h.Attributes["display_ads_title"]); v != "" {
			return v
		}
	}
	return mediaExpertURLStem(mediaExpertAbsoluteURL(h.Link))
}

func mediaExpertSearchHaystack(item *mediaExpertSearchItem) string {
	var b strings.Builder
	b.WriteString(item.Title)
	b.WriteString(" ")
	b.WriteString(mediaExpertURLStem(item.Link))
	b.WriteString(" ")
	b.WriteString(mediaExpertURLStem(mediaExpertAbsoluteURL(item.Link)))
	for _, v := range item.Attributes {
		b.WriteString(" ")
		b.WriteString(v)
	}
	return b.String()
}

func hitShowsManufacturerCodeMediaExpert(item *mediaExpertSearchItem, code string) bool {
	c := normalizeMfrKey(code)
	if len(c) < 4 {
		return false
	}
	hay := normalizeMfrKey(mediaExpertSearchHaystack(item))
	return strings.Contains(hay, c)
}

// manufacturerCodeFromMediaExpertItem picks an MPN-like value from Synerise attributes when present.
func manufacturerCodeFromMediaExpertItem(item mediaExpertSearchItem) string {
	for k, v := range item.Attributes {
		kl := strings.ToLower(strings.TrimSpace(k))
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if strings.Contains(kl, "kod") && strings.Contains(kl, "producent") {
			return truncateManufacturerCode(v)
		}
		if kl == "mpn" || kl == "indeks" || strings.Contains(kl, "numer katalogowy") {
			return truncateManufacturerCode(v)
		}
	}
	return ""
}

func pickBestMediaExpertHit(productTitle, manufacturerCode string, hits []mediaExpertSearchItem) (best mediaExpertSearchItem, score float64, ok bool) {
	code := strings.TrimSpace(manufacturerCode)
	pool := hits
	if code != "" {
		var filtered []mediaExpertSearchItem
		for i := range hits {
			if hitShowsManufacturerCodeMediaExpert(&hits[i], code) {
				filtered = append(filtered, hits[i])
			}
		}
		if len(filtered) > 0 {
			pool = filtered
		}
	}

	var top *mediaExpertSearchItem
	topScore := 0.0
	for i := range pool {
		h := &pool[i]
		candidate := mediaExpertHitCandidateTitle(h)
		s := titleTokenJaccard(productTitle, candidate)
		if code != "" && hitShowsManufacturerCodeMediaExpert(h, code) && s < 0.42 {
			s = 0.42
		}
		if s > topScore {
			topScore = s
			top = h
		}
	}
	if top == nil {
		return mediaExpertSearchItem{}, 0, false
	}
	return *top, topScore, true
}

func scrapeResultFromMediaExpertSearchItem(item *mediaExpertSearchItem) (*ScrapeResult, string, error) {
	abs := mediaExpertAbsoluteURL(item.Link)
	if abs == "" {
		return nil, "", errors.New("empty mediaexpert product link")
	}
	if _, err := neturl.Parse(abs); err != nil {
		return nil, "", err
	}
	name := mediaExpertHitCandidateTitle(item)
	if strings.TrimSpace(name) == "" || item.Price.Value <= 0 {
		return nil, "", errors.New("mediaexpert search item missing title or price")
	}
	return &ScrapeResult{
		ProductName:      strings.TrimSpace(name),
		Price:            item.Price.Value,
		Currency:         "PLN",
		ImageURL:         strings.TrimSpace(item.ImageLink),
		IsAvailable:      mediaExpertAvailabilityFromSearch(*item),
		ManufacturerCode: manufacturerCodeFromMediaExpertItem(*item),
	}, abs, nil
}

func mediaExpertTargetStoreSlugInDB(app *App) (slug string, store *Store, err error) {
	for _, s := range []string{"mediaexpert", "media-expert"} {
		st, e := app.db.GetStoreBySlug(s)
		if e == nil {
			return s, st, nil
		}
	}
	return "", nil, errors.New("no Media Expert store row (tried slugs mediaexpert, media-expert)")
}

func (app *App) runLinkMediaExpert(sourceStoreSlug, productCategory string, limit int, minScore float64, maxSearchHits int, dryRun, probe bool) LinkMediaExpertSummary {
	start := time.Now()
	sum := LinkMediaExpertSummary{DryRun: dryRun, Probe: probe}

	targetSlug, meStore, err := mediaExpertTargetStoreSlugInDB(app)
	if err != nil {
		log.Printf("[link/mediaexpert] store: %v", err)
		sum.Errors++
		sum.DurationMs = time.Since(start).Milliseconds()
		return sum
	}

	var me *MediaExpertScraper
	if probe {
		me = NewMediaExpertScraper(app.config.UserAgent, 0)
	} else {
		scraper, gerr := app.registry.Get("mediaexpert")
		if gerr != nil {
			log.Printf("[link/mediaexpert] scraper: %v", gerr)
			sum.Errors++
			sum.DurationMs = time.Since(start).Milliseconds()
			return sum
		}
		var ok bool
		me, ok = scraper.(*MediaExpertScraper)
		if !ok {
			log.Printf("[link/mediaexpert] scraper is not *MediaExpertScraper")
			sum.Errors++
			sum.DurationMs = time.Since(start).Milliseconds()
			return sum
		}
	}

	products, err := app.db.ListProductsWithSourceWithoutTargetStore(sourceStoreSlug, targetSlug, productCategory, limit)
	if err != nil {
		log.Printf("[link/mediaexpert] list products: %v", err)
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

		var hits []mediaExpertSearchItem
		var lastSearchErr error
		for _, q := range queries {
			h, err := me.search(q, maxSearchHits)
			if err != nil {
				lastSearchErr = err
				log.Printf("[link/mediaexpert] search %q (product %d): %v", q, pr.ID, err)
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

		linkTitle := productTitleForLinking(sourceStoreSlug, pr)
		best, score, ok := pickBestMediaExpertHit(linkTitle, manufacturerCodeForLinking(pr.ManufacturerCode), hits)
		if !ok || score < minScore {
			sum.SkippedLowScore++
			log.Printf("[link/mediaexpert] product %d: best score %.3f < %.3f — skip", pr.ID, score, minScore)
			continue
		}

		scraped, productURL, err := scrapeResultFromMediaExpertSearchItem(&best)
		if err != nil {
			log.Printf("[link/mediaexpert] product %d: search hit: %v", pr.ID, err)
			sum.Errors++
			continue
		}

		if dryRun {
			sum.Linked++
			log.Printf("[link/mediaexpert] DRY product %d: would link score=%.3f url=%s", pr.ID, score, productURL)
			continue
		}

		if want := manufacturerCodeForLinking(pr.ManufacturerCode); want != "" {
			got := strings.TrimSpace(scraped.ManufacturerCode)
			if got != "" && !manufacturerCodesCompatible(want, got) {
				sum.SkippedMfrMismatch++
				log.Printf("[link/mediaexpert] product %d: MPN mismatch ours=%q mediaexpert=%q — skip", pr.ID, want, got)
				continue
			}
		}

		newPrice := math.Round(scraped.Price*100) / 100
		currency := scraped.Currency
		if currency == "" {
			currency = "PLN"
		}

		if err := app.db.UpsertPriceForProduct(pr.ID, meStore.ID, newPrice, currency, productURL, scraped.IsAvailable); err != nil {
			log.Printf("[link/mediaexpert] upsert price product %d: %v", pr.ID, err)
			sum.Errors++
			continue
		}

		sum.Linked++
		log.Printf("[link/mediaexpert] product %d: linked score=%.3f price=%.2f %s url=%s", pr.ID, score, newPrice, currency, productURL)
	}

	sum.DurationMs = time.Since(start).Milliseconds()
	return sum
}
