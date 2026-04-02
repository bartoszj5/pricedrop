package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

// jsonLDProduct represents the JSON-LD Product schema embedded in x-kom.pl pages.
type jsonLDProduct struct {
	Type      string       `json:"@type"`
	Name      string       `json:"name"`
	ProductID string       `json:"productID"`
	SKU       string       `json:"sku"`
	Image     []string     `json:"image"`
	Offers    jsonLDOffers `json:"offers"`
	Brand     *jsonLDBrand `json:"brand"`
}

type jsonLDOffers struct {
	Price         json.Number `json:"price"`
	PriceCurrency string      `json:"priceCurrency"`
}

type jsonLDBrand struct {
	Name string `json:"name"`
}

type XKomScraper struct {
	userAgent    string
	requestDelay time.Duration
}

func NewXKomScraper(userAgent string, requestDelay time.Duration) *XKomScraper {
	return &XKomScraper{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (s *XKomScraper) StoreName() string {
	return "x-kom"
}

func (s *XKomScraper) ScrapeProduct(url string) (*ScrapeResult, error) {
	var result ScrapeResult
	var scrapeErr error

	c := colly.NewCollector(
		colly.AllowedDomains("www.x-kom.pl", "x-kom.pl"),
		colly.UserAgent(s.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*x-kom.pl*",
		Delay:       s.requestDelay,
		RandomDelay: 500 * time.Millisecond,
		Parallelism: 1,
	})

	// Set browser-like headers on every request.
	c.OnRequest(func(r *colly.Request) {
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
		r.Headers.Set("Accept-Language", "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7")
		r.Headers.Set("Accept-Encoding", "gzip, deflate")
		r.Headers.Set("Cache-Control", "no-cache")
		r.Headers.Set("Pragma", "no-cache")
		r.Headers.Set("Sec-Ch-Ua", `"Chromium";v="131", "Not_A Brand";v="24"`)
		r.Headers.Set("Sec-Ch-Ua-Mobile", "?0")
		r.Headers.Set("Sec-Ch-Ua-Platform", `"Windows"`)
		r.Headers.Set("Sec-Fetch-Dest", "document")
		r.Headers.Set("Sec-Fetch-Mode", "navigate")
		r.Headers.Set("Sec-Fetch-Site", "none")
		r.Headers.Set("Sec-Fetch-User", "?1")
		r.Headers.Set("Upgrade-Insecure-Requests", "1")
		log.Printf("[x-kom] Scraping: %s", r.URL.String())
	})

	// Extract product data from JSON-LD script tags.
	c.OnHTML(`script[type="application/ld+json"]`, func(e *colly.HTMLElement) {
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(e.Text), &raw); err != nil {
			return
		}
		if raw["@type"] != "Product" {
			return
		}

		var product jsonLDProduct
		if err := json.Unmarshal([]byte(e.Text), &product); err != nil {
			log.Printf("[x-kom] failed to parse JSON-LD Product: %v", err)
			return
		}

		result.ProductName = product.Name
		result.Currency = product.Offers.PriceCurrency
		if result.Currency == "" {
			result.Currency = "PLN"
		}

		price, err := product.Offers.Price.Float64()
		if err != nil {
			log.Printf("[x-kom] failed to parse price %q: %v", product.Offers.Price, err)
			scrapeErr = fmt.Errorf("parsing price: %w", err)
			return
		}
		result.Price = price
		result.IsAvailable = price > 0

		if len(product.Image) > 0 {
			result.ImageURL = product.Image[0]
		}
	})

	// Fallback: extract price from meta tags if JSON-LD didn't work.
	c.OnHTML(`meta[property="product:price:amount"]`, func(e *colly.HTMLElement) {
		if result.Price > 0 {
			return
		}
		content := e.Attr("content")
		if content == "" {
			return
		}
		price, err := strconv.ParseFloat(strings.TrimSpace(content), 64)
		if err != nil {
			log.Printf("[x-kom] failed to parse meta price %q: %v", content, err)
			return
		}
		result.Price = price
		result.IsAvailable = price > 0
	})

	c.OnHTML(`meta[property="product:price:currency"]`, func(e *colly.HTMLElement) {
		if result.Currency != "" {
			return
		}
		if content := e.Attr("content"); content != "" {
			result.Currency = content
		}
	})

	c.OnHTML(`meta[property="og:title"]`, func(e *colly.HTMLElement) {
		if result.ProductName != "" {
			return
		}
		if content := e.Attr("content"); content != "" {
			parts := strings.SplitN(content, " - ", 2)
			result.ProductName = strings.TrimSpace(parts[0])
		}
	})

	c.OnResponse(func(r *colly.Response) {
		body := string(r.Body)
		log.Printf("[x-kom] HTTP %d, body: %d bytes, has ld+json: %v, has og:title: %v",
			r.StatusCode, len(body),
			strings.Contains(body, "application/ld+json"),
			strings.Contains(body, "og:title"))
		// Log first 500 chars to see what we're getting.
		preview := body
		if len(preview) > 500 {
			preview = preview[:500]
		}
		log.Printf("[x-kom] Body preview: %s", preview)
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[x-kom] HTTP %d for %s (body: %d bytes)", r.StatusCode, r.Request.URL, len(r.Body))
		scrapeErr = fmt.Errorf("HTTP %d for %s: %w", r.StatusCode, r.Request.URL, err)
	})

	if err := c.Visit(url); err != nil {
		return nil, fmt.Errorf("visiting %s: %w", url, err)
	}

	if scrapeErr != nil {
		return nil, scrapeErr
	}

	if result.ProductName == "" && result.Price == 0 {
		return nil, fmt.Errorf("no product data found at %s", url)
	}

	return &result, nil
}
