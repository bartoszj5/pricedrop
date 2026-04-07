package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

// moreleJSONLDProduct represents the JSON-LD Product schema embedded in morele.net pages.
type moreleJSONLDProduct struct {
	Type      string            `json:"@type"`
	Name      string            `json:"name"`
	ProductID string            `json:"productID"`
	SKU       string            `json:"sku"`
	MPN       string            `json:"mpn"`
	Image     []string          `json:"image"`
	Offers    moreleJSONLDOffer `json:"offers"`
}

type moreleJSONLDOffer struct {
	Price         json.Number `json:"price"`
	PriceCurrency string      `json:"priceCurrency"`
	Availability  string      `json:"availability"`
}

type MoreleScraper struct {
	userAgent    string
	requestDelay time.Duration
}

func NewMoreleScraper(userAgent string, requestDelay time.Duration) *MoreleScraper {
	return &MoreleScraper{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (s *MoreleScraper) StoreName() string {
	return "morele"
}

func (s *MoreleScraper) ScrapeProduct(url string) (*ScrapeResult, error) {
	var result ScrapeResult
	var scrapeErr error
	result.IsAvailable = true

	c := colly.NewCollector(
		colly.AllowedDomains("www.morele.net", "morele.net"),
		colly.UserAgent(s.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	randomJitter := 500 * time.Millisecond
	if s.requestDelay <= 0 {
		randomJitter = 0
	}
	c.Limit(&colly.LimitRule{
		DomainGlob:  "*morele.net*",
		Delay:       s.requestDelay,
		RandomDelay: randomJitter,
		Parallelism: 1,
	})

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
		log.Printf("[morele] Scraping: %s", r.URL.String())
	})

	c.OnResponse(func(r *colly.Response) {
		body := string(r.Body)

		if strings.Contains(body, "OutOfStock") || strings.Contains(body, "Discontinued") {
			result.IsAvailable = false
		}

		moreleUnavailableMarkers := []string{
			"Produkt niedostępny",
			"produkt niedostępny",
			"Powiadom o dostępności",
			"Produkt wycofany",
			"produkt wycofany",
		}
		for _, marker := range moreleUnavailableMarkers {
			if strings.Contains(body, marker) {
				log.Printf("[morele] Unavailable: found %q in page", marker)
				result.IsAvailable = false
				break
			}
		}

		if strings.Contains(body, "Do koszyka") || strings.Contains(body, "Dodaj do koszyka") {
			result.IsAvailable = true
		}
	})

	c.OnHTML(`script[type="application/ld+json"]`, func(e *colly.HTMLElement) {
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(e.Text), &raw); err != nil {
			return
		}
		if raw["@type"] != "Product" {
			return
		}

		var product moreleJSONLDProduct
		if err := json.Unmarshal([]byte(e.Text), &product); err != nil {
			log.Printf("[morele] failed to parse JSON-LD Product: %v", err)
			return
		}

		result.ProductName = product.Name
		result.Currency = product.Offers.PriceCurrency
		if result.Currency == "" {
			result.Currency = "PLN"
		}

		if product.Offers.Availability != "" {
			avail := strings.ToLower(product.Offers.Availability)
			result.IsAvailable = strings.Contains(avail, "instock")
		}

		price, err := product.Offers.Price.Float64()
		if err != nil {
			log.Printf("[morele] failed to parse price %q: %v", product.Offers.Price, err)
			// Out-of-stock products on morele.net may not have a price field.
			if !result.IsAvailable {
				result.Price = 0
			} else {
				scrapeErr = fmt.Errorf("parsing price: %w", err)
			}
			return
		}
		result.Price = price

		if len(product.Image) > 0 {
			result.ImageURL = product.Image[0]
		}

		result.ManufacturerCode = strings.TrimSpace(product.MPN)
		if result.ManufacturerCode == "" {
			result.ManufacturerCode = strings.TrimSpace(product.SKU)
		}
		if result.ManufacturerCode != "" {
			result.ManufacturerCode = truncateManufacturerCode(result.ManufacturerCode)
		}
	})

	// Fallback: extract image from og:image meta tag.
	c.OnHTML(`meta[property="og:image"]`, func(e *colly.HTMLElement) {
		if result.ImageURL != "" {
			return
		}
		if content := e.Attr("content"); content != "" {
			result.ImageURL = content
		}
	})

	c.OnHTML(`meta[property="og:title"]`, func(e *colly.HTMLElement) {
		if result.ProductName != "" {
			return
		}
		if content := e.Attr("content"); content != "" {
			// og:title format: "Product Name - Category - Morele.net"
			parts := strings.SplitN(content, " - ", 2)
			result.ProductName = strings.TrimSpace(parts[0])
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[morele] HTTP %d for %s (body: %d bytes)", r.StatusCode, r.Request.URL, len(r.Body))
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
