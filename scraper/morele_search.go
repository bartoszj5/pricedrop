package main

import (
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// MoreleSearchHit is one product link from Morele search results (order preserved).
type MoreleSearchHit struct {
	URL   string
	Title string
}

// Listing cards on /wyszukiwarka/ use Stimulus: data-link-href-param + title on the same element.
var moreleSearchListingRE = regexp.MustCompile(`data-link-href-param="(/[a-z0-9][^"]+?-\d+/)"[^>]*title="([^"]*)"`)

// Shared client keeps TLS session / HTTP keep-alive between consecutive search requests.
var moreleSearchHTTPClient = &http.Client{
	Timeout: 45 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        16,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
	},
}

// SearchMorele loads the search results page once and parses product cards from HTML
// (same data the front-end uses; no Colly, no headless browser).
func SearchMorele(userAgent string, requestDelay time.Duration, query string, maxHits int) ([]MoreleSearchHit, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty search query")
	}
	if maxHits <= 0 {
		maxHits = 25
	}

	if requestDelay > 0 {
		time.Sleep(requestDelay)
	}

	searchURL := "https://www.morele.net/wyszukiwarka/?q=" + url.QueryEscape(query)

	req, err := http.NewRequest(http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("morele search request: %w", err)
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := moreleSearchHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("morele search GET: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("morele search read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("morele search HTTP %d for %s", resp.StatusCode, searchURL)
	}

	log.Printf("[morele/search] Fetched %s (%d bytes)", searchURL, len(body))

	return parseMoreleSearchHTML(body, maxHits), nil
}

func parseMoreleSearchHTML(body []byte, maxHits int) []MoreleSearchHit {
	seen := make(map[string]struct{})
	var hits []MoreleSearchHit

	for _, m := range moreleSearchListingRE.FindAllSubmatch(body, -1) {
		if len(hits) >= maxHits {
			break
		}
		path := string(m[1])
		title := html.UnescapeString(strings.TrimSpace(string(m[2])))

		fullURL := "https://www.morele.net" + path
		fullURL = strings.TrimRight(fullURL, "/") + "/"

		if !moreleProductRegex.MatchString(fullURL) {
			continue
		}
		if _, ok := seen[fullURL]; ok {
			continue
		}
		seen[fullURL] = struct{}{}

		if title == "" {
			title = moreleURLStem(fullURL)
		} else {
			title = cleanLinkText(title)
		}
		hits = append(hits, MoreleSearchHit{URL: fullURL, Title: title})
	}

	return hits
}
