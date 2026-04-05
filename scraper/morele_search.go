package main

import (
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

// MoreleSearchHit is one product link from Morele search results (order preserved).
type MoreleSearchHit struct {
	URL   string
	Title string
}

// SearchMorele visits the public search page and collects unique product URLs (first maxHits).
func SearchMorele(userAgent string, requestDelay time.Duration, query string, maxHits int) ([]MoreleSearchHit, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty search query")
	}
	if maxHits <= 0 {
		maxHits = 25
	}

	searchURL := "https://www.morele.net/wyszukiwarka/?q=" + url.QueryEscape(query)

	var hits []MoreleSearchHit
	seen := make(map[string]struct{})
	var visitErr error

	c := colly.NewCollector(
		colly.AllowedDomains("www.morele.net", "morele.net"),
		colly.UserAgent(userAgent),
		colly.IgnoreRobotsTxt(),
	)

	randomJitter := 500 * time.Millisecond
	if requestDelay <= 0 {
		randomJitter = 0
	}
	c.Limit(&colly.LimitRule{
		DomainGlob:  "*morele.net*",
		Delay:       requestDelay,
		RandomDelay: randomJitter,
		Parallelism: 1,
	})

	c.OnRequest(func(r *colly.Request) {
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
		r.Headers.Set("Accept-Language", "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7")
		r.Headers.Set("Accept-Encoding", "gzip, deflate")
		r.Headers.Set("Cache-Control", "no-cache")
		r.Headers.Set("Sec-Ch-Ua", `"Chromium";v="131", "Not_A Brand";v="24"`)
		r.Headers.Set("Sec-Ch-Ua-Mobile", "?0")
		r.Headers.Set("Sec-Ch-Ua-Platform", `"Windows"`)
		r.Headers.Set("Sec-Fetch-Dest", "document")
		r.Headers.Set("Sec-Fetch-Mode", "navigate")
		r.Headers.Set("Sec-Fetch-Site", "none")
		r.Headers.Set("Sec-Fetch-User", "?1")
		r.Headers.Set("Upgrade-Insecure-Requests", "1")
		log.Printf("[morele/search] Visiting: %s", r.URL.String())
	})

	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		if len(hits) >= maxHits {
			return
		}
		fullURL := e.Request.AbsoluteURL(e.Attr("href"))
		if fullURL == "" {
			return
		}
		if idx := strings.IndexAny(fullURL, "?#"); idx != -1 {
			fullURL = fullURL[:idx]
		}
		if !strings.HasSuffix(fullURL, "/") {
			fullURL += "/"
		}
		if !moreleProductRegex.MatchString(fullURL) {
			return
		}
		if _, ok := seen[fullURL]; ok {
			return
		}
		seen[fullURL] = struct{}{}
		t := cleanLinkText(e.Text)
		hits = append(hits, MoreleSearchHit{URL: fullURL, Title: t})
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[morele/search] HTTP %d for %s", r.StatusCode, r.Request.URL)
		visitErr = fmt.Errorf("HTTP %d for %s: %w", r.StatusCode, r.Request.URL, err)
	})

	if err := c.Visit(searchURL); err != nil {
		return nil, fmt.Errorf("visiting search: %w", err)
	}
	if visitErr != nil {
		return nil, visitErr
	}
	return hits, nil
}
