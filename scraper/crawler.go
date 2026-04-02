package main

import (
	"fmt"
	"regexp"
	"strings"
)

// DiscoveredProduct holds data about a product found on a category/listing page.
type DiscoveredProduct struct {
	URL      string  // Product page URL (always set)
	Title    string  // May be empty if not available from listing
	Price    float64 // May be 0 if not available from listing
	Currency string  // May be empty
	ImageURL string  // May be empty
}

// CrawlCategoryResult summarises the outcome of crawling one category for one store.
type CrawlCategoryResult struct {
	Store      string `json:"store"`
	Category   string `json:"category"`
	Discovered int    `json:"discovered"`
	New        int    `json:"new"`
	Existing   int    `json:"existing"`
	Errors     int    `json:"errors"`
	DurationMs int64  `json:"duration_ms"`
}

// StoreCrawler discovers products by visiting store category / listing pages.
type StoreCrawler interface {
	// CrawlCategory visits the category page (and its subsequent pages up to maxPages)
	// and returns all discovered product entries.
	CrawlCategory(categoryURL string, maxPages int) ([]DiscoveredProduct, error)
	// DefaultCategories returns a map of category slug → listing URL for the store.
	DefaultCategories() map[string]string
	StoreName() string
}

// CrawlerRegistry maps store slugs to their crawler implementations.
type CrawlerRegistry struct {
	crawlers map[string]StoreCrawler
}

func NewCrawlerRegistry() *CrawlerRegistry {
	return &CrawlerRegistry{
		crawlers: make(map[string]StoreCrawler),
	}
}

func (r *CrawlerRegistry) Register(storeSlug string, crawler StoreCrawler) {
	r.crawlers[storeSlug] = crawler
}

func (r *CrawlerRegistry) Get(storeSlug string) (StoreCrawler, error) {
	c, ok := r.crawlers[storeSlug]
	if !ok {
		return nil, fmt.Errorf("no crawler registered for store: %s", storeSlug)
	}
	return c, nil
}

func (r *CrawlerRegistry) RegisteredSlugs() []string {
	slugs := make([]string, 0, len(r.crawlers))
	for slug := range r.crawlers {
		slugs = append(slugs, slug)
	}
	return slugs
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var nonAlphanumRegex = regexp.MustCompile(`[^a-z0-9]+`)

// slugify converts a product title to a URL-friendly slug.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))

	// Replace Polish diacritics.
	r := strings.NewReplacer(
		"ą", "a", "ć", "c", "ę", "e", "ł", "l", "ń", "n",
		"ó", "o", "ś", "s", "ź", "z", "ż", "z",
	)
	s = r.Replace(s)

	s = nonAlphanumRegex.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// addPageParam appends ?page=N (or &page=N) to a URL.
func addPageParam(baseURL string, page int) string {
	if page <= 1 {
		return baseURL
	}
	sep := "?"
	if strings.Contains(baseURL, "?") {
		sep = "&"
	}
	return fmt.Sprintf("%s%spage=%d", baseURL, sep, page)
}
