package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	neturl "net/url"
	"path"
	"strings"
	"time"
)

const (
	mediaExpertSearchIndex = "bde4319ab3462883803d0d7062ed396f1589349693"
	mediaExpertSearchToken = "AC3815B3-B512-1F8F-F6CB-3754D3D58BF9"
	mediaExpertSearchURL   = "https://api.synerise.com/search/v2/indices/" + mediaExpertSearchIndex + "/query"
)

type mediaExpertSearchResponse struct {
	Data []mediaExpertSearchItem `json:"data"`
}

type mediaExpertSearchItem struct {
	ItemID     string                 `json:"itemId"`
	Link       string                 `json:"link"`
	Title      string                 `json:"title"`
	ImageLink  string                 `json:"imageLink"`
	Brand      string                 `json:"brand"`
	Category   string                 `json:"category"`
	Price      mediaExpertSearchPrice `json:"price"`
	Attributes map[string]string      `json:"attributes"`
}

type mediaExpertSearchPrice struct {
	Value float64 `json:"value"`
}

type MediaExpertScraper struct {
	userAgent    string
	requestDelay time.Duration
	httpClient   *http.Client
}

func NewMediaExpertScraper(userAgent string, requestDelay time.Duration) *MediaExpertScraper {
	return &MediaExpertScraper{
		userAgent:    userAgent,
		requestDelay: requestDelay,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (s *MediaExpertScraper) StoreName() string {
	return "mediaexpert"
}

func (s *MediaExpertScraper) ScrapeProduct(productURL string) (*ScrapeResult, error) {
	query, err := mediaExpertQueryFromProductURL(productURL)
	if err != nil {
		return nil, err
	}

	item, err := s.findProduct(productURL, query)
	if err != nil {
		return nil, err
	}

	if item.Title == "" || item.Price.Value <= 0 {
		return nil, fmt.Errorf("mediaexpert search result missing required data for %s", productURL)
	}

	result := &ScrapeResult{
		ProductName: strings.TrimSpace(item.Title),
		Price:       item.Price.Value,
		Currency:    "PLN",
		ImageURL:    strings.TrimSpace(item.ImageLink),
		IsAvailable: mediaExpertAvailabilityFromSearch(*item),
	}

	log.Printf("[mediaexpert] Matched %s -> itemId=%s price=%.2f available=%v",
		productURL, item.ItemID, result.Price, result.IsAvailable)

	return result, nil
}

func (s *MediaExpertScraper) findProduct(productURL, query string) (*mediaExpertSearchItem, error) {
	if s.requestDelay > 0 {
		time.Sleep(s.requestDelay)
	}

	results, err := s.search(query, 10)
	if err != nil {
		return nil, err
	}

	targetKey := normalizeMediaExpertURL(productURL)
	for _, item := range results {
		if normalizeMediaExpertURL(item.Link) == targetKey {
			return &item, nil
		}
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no mediaexpert search results for %s", productURL)
	}

	return nil, fmt.Errorf("mediaexpert search did not return exact match for %s", productURL)
}

func (s *MediaExpertScraper) search(query string, limit int) ([]mediaExpertSearchItem, error) {
	params := neturl.Values{}
	params.Set("query", query)
	params.Set("limit", fmt.Sprintf("%d", limit))
	params.Set("clientUUID", "pricedrop-mediaexpert-scraper")
	params.Set("token", mediaExpertSearchToken)
	params.Set("filters", `category!="Outlet"`)

	req, err := http.NewRequest(http.MethodGet, mediaExpertSearchURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("creating mediaexpert search request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("User-Agent", s.userAgent)
	req.Header.Set("Referer", "https://www.mediaexpert.pl/")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling mediaexpert search API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mediaexpert search API returned HTTP %d", resp.StatusCode)
	}

	var payload mediaExpertSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decoding mediaexpert search API response: %w", err)
	}

	return payload.Data, nil
}

func mediaExpertQueryFromProductURL(rawURL string) (string, error) {
	parsed, err := neturl.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("parsing mediaexpert URL %q: %w", rawURL, err)
	}

	slug := strings.Trim(path.Base(strings.TrimSpace(parsed.Path)), "/")
	if slug == "" || slug == "." || slug == "/" {
		return "", fmt.Errorf("could not derive product slug from %s", rawURL)
	}

	slug, err = neturl.PathUnescape(slug)
	if err != nil {
		return "", fmt.Errorf("decoding product slug from %s: %w", rawURL, err)
	}

	slug = strings.TrimSuffix(slug, ".html")
	slug = strings.ReplaceAll(slug, "-", " ")
	slug = strings.Join(strings.Fields(slug), " ")
	if slug == "" {
		return "", fmt.Errorf("could not derive mediaexpert search query from %s", rawURL)
	}

	return slug, nil
}

func normalizeMediaExpertURL(rawURL string) string {
	parsed, err := neturl.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return strings.TrimRight(strings.ToLower(strings.TrimSpace(rawURL)), "/")
	}

	host := strings.TrimPrefix(strings.ToLower(parsed.Host), "www.")
	cleanPath := strings.TrimRight(strings.ToLower(parsed.EscapedPath()), "/")
	if cleanPath == "" {
		cleanPath = "/"
	}

	return host + cleanPath
}

func mediaExpertAvailabilityFromSearch(item mediaExpertSearchItem) bool {
	if item.Price.Value <= 0 {
		return false
	}

	title := strings.ToLower(item.Title)
	if strings.Contains(title, "wycof") || strings.Contains(title, "niedost") {
		return false
	}

	return true
}
