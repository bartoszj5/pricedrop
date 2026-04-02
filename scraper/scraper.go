package main

import "fmt"

// StoreScraper defines the interface that each store scraper must implement.
type StoreScraper interface {
	// ScrapeProduct visits the given URL and extracts product/price data.
	ScrapeProduct(url string) (*ScrapeResult, error)
	// StoreName returns the human-readable store name.
	StoreName() string
}

// ScraperRegistry maps store slugs to their scraper implementations.
type ScraperRegistry struct {
	scrapers map[string]StoreScraper
}

func NewScraperRegistry() *ScraperRegistry {
	return &ScraperRegistry{
		scrapers: make(map[string]StoreScraper),
	}
}

func (r *ScraperRegistry) Register(storeSlug string, scraper StoreScraper) {
	r.scrapers[storeSlug] = scraper
}

func (r *ScraperRegistry) Get(storeSlug string) (StoreScraper, error) {
	s, ok := r.scrapers[storeSlug]
	if !ok {
		return nil, fmt.Errorf("no scraper registered for store: %s", storeSlug)
	}
	return s, nil
}

func (r *ScraperRegistry) RegisteredSlugs() []string {
	slugs := make([]string, 0, len(r.scrapers))
	for slug := range r.scrapers {
		slugs = append(slugs, slug)
	}
	return slugs
}
