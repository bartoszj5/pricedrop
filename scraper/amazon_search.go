package main

import (
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	neturl "net/url"
	"regexp"
	"strings"
	"time"
)

// AmazonSearchHit is one product from an Amazon.pl search results page (parsed HTML).
type AmazonSearchHit struct {
	URL   string
	Title string
}

// amazonSearchHTTPClient keeps TLS session between consecutive search requests.
var amazonSearchHTTPClient = &http.Client{
	Timeout: 45 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        16,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
	},
}

var (
	amazonSearchResultHead = regexp.MustCompile(`data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"`)
	amazonSearchTitleSpan  = regexp.MustCompile(`<h2[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>\s*<span>([^<]*)</span>`)
	amazonSearchTitleAria  = regexp.MustCompile(`<h2[^>]*aria-label="([^"]+)"[^>]*class="[^"]*a-text-normal`)
)

func normalizeAmazonListingTitle(s string) string {
	s = html.UnescapeString(strings.TrimSpace(s))
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > 500 {
		s = s[:500]
		s = strings.TrimSpace(s)
	}
	return s
}

func amazonCanonicalProductURL(asin string) string {
	asin = strings.TrimSpace(strings.ToUpper(asin))
	if len(asin) != 10 {
		return ""
	}
	return "https://www.amazon.pl/dp/" + asin
}

// SearchAmazon loads https://www.amazon.pl/s?k=... once and parses product cards from HTML.
// Amazon exposes completion.amazon.pl JSON for keyword suggestions only (no ASINs); product linking uses this HTML search.
func SearchAmazon(userAgent string, requestDelay time.Duration, query string, maxHits int) ([]AmazonSearchHit, error) {
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

	searchURL := "https://www.amazon.pl/s?k=" + neturl.QueryEscape(query)

	req, err := http.NewRequest(http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("amazon search request: %w", err)
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

	resp, err := amazonSearchHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("amazon search GET: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("amazon search read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("amazon search HTTP %d for %s", resp.StatusCode, searchURL)
	}

	log.Printf("[amazon/search] Fetched %s (%d bytes)", searchURL, len(body))

	return parseAmazonSearchHTML(body, maxHits), nil
}

func parseAmazonSearchHTML(body []byte, maxHits int) []AmazonSearchHit {
	idx := amazonSearchResultHead.FindAllSubmatchIndex(body, -1)
	if len(idx) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	var hits []AmazonSearchHit

	for i, pair := range idx {
		asinStart, asinEnd := pair[2], pair[3]
		asin := string(body[asinStart:asinEnd])
		blockStart := pair[0]
		blockEnd := len(body)
		if i+1 < len(idx) {
			blockEnd = idx[i+1][0]
		}
		block := body[blockStart:blockEnd]

		url := amazonCanonicalProductURL(asin)
		if url == "" {
			continue
		}
		if _, ok := seen[url]; ok {
			continue
		}

		title := ""
		if m := amazonSearchTitleSpan.FindSubmatch(block); len(m) >= 2 {
			title = normalizeAmazonListingTitle(string(m[1]))
		}
		if title == "" {
			if m := amazonSearchTitleAria.FindSubmatch(block); len(m) >= 2 {
				title = normalizeAmazonListingTitle(string(m[1]))
				// aria-label often starts with "Reklama sponsorowana — " on sponsored rows
				title = strings.TrimPrefix(title, "Reklama sponsorowana — ")
				title = strings.TrimPrefix(title, "Sponsored Ad — ")
				title = strings.TrimSpace(title)
			}
		}
		if title == "" {
			continue
		}

		seen[url] = struct{}{}
		hits = append(hits, AmazonSearchHit{URL: url, Title: title})
		if len(hits) >= maxHits {
			break
		}
	}

	return hits
}

func hitShowsManufacturerCodeAmazon(hit *AmazonSearchHit, code string) bool {
	c := normalizeMfrKey(code)
	if len(c) < 4 {
		return false
	}
	// Amazon slug is not in our URL; match on title only.
	hay := normalizeMfrKey(hit.Title)
	return strings.Contains(hay, c)
}

// amazonMinScoreWhenMfrNotInHit: if our DB row has an MPN but the Amazon card title does not contain it,
// require stronger title overlap — otherwise unrelated listings (e.g. accessories) score ~0.43 on shared tokens.
const amazonMinScoreWhenMfrNotInHit = 0.52

// searchQueryIsManufacturerCode reports whether this search attempt was the MPN-style query (same normalized key).
func searchQueryIsManufacturerCode(searchQuery, manufacturerCode string) bool {
	q := normalizeMfrKey(searchQuery)
	c := normalizeMfrKey(manufacturerCode)
	return len(c) >= 4 && q == c && q != ""
}

// pickBestAmazonHit chooses a listing. searchQuery matters: when it equals manufacturerCode, only rows whose
// title contains that MPN are considered — otherwise Amazon returns many irrelevant ASINs for short model codes.
func pickBestAmazonHit(productTitle, manufacturerCode string, hits []AmazonSearchHit, searchQuery string) (best AmazonSearchHit, score float64, ok bool) {
	code := strings.TrimSpace(manufacturerCode)
	pool := hits

	if searchQueryIsManufacturerCode(searchQuery, code) {
		var onlyMfr []AmazonSearchHit
		for i := range hits {
			if hitShowsManufacturerCodeAmazon(&hits[i], code) {
				onlyMfr = append(onlyMfr, hits[i])
			}
		}
		if len(onlyMfr) == 0 {
			return AmazonSearchHit{}, 0, false
		}
		pool = onlyMfr
	} else if code != "" {
		var filtered []AmazonSearchHit
		for i := range hits {
			if hitShowsManufacturerCodeAmazon(&hits[i], code) {
				filtered = append(filtered, hits[i])
			}
		}
		if len(filtered) > 0 {
			pool = filtered
		}
	}

	var top *AmazonSearchHit
	topScore := 0.0
	for i := range pool {
		h := &pool[i]
		candidate := strings.TrimSpace(h.Title)
		s := titleTokenJaccard(productTitle, candidate)
		if code != "" && hitShowsManufacturerCodeAmazon(h, code) && s < 0.42 {
			s = 0.42
		}
		if s > topScore {
			topScore = s
			top = h
		}
	}
	if top == nil {
		return AmazonSearchHit{}, 0, false
	}
	return *top, topScore, true
}

// amazonHitPassesMfrTitleGuard blocks weak matches when we have a real MPN but Amazon title does not show it.
func amazonHitPassesMfrTitleGuard(manufacturerCode string, hit *AmazonSearchHit, score float64) bool {
	code := strings.TrimSpace(manufacturerCode)
	if len(normalizeMfrKey(code)) < 4 {
		return true
	}
	if hitShowsManufacturerCodeAmazon(hit, code) {
		return true
	}
	return score >= amazonMinScoreWhenMfrNotInHit
}
