package main

import (
	"encoding/json"
	"fmt"
	"html"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

type mediaExpertJSONLDProduct struct {
	Type      string                  `json:"@type"`
	Name      string                  `json:"name"`
	ProductID string                  `json:"productID"`
	SKU       string                  `json:"sku"`
	Image     []string                `json:"image"`
	Offers    mediaExpertJSONLDOffers `json:"offers"`
	Brand     *mediaExpertJSONLDBrand `json:"brand"`
}

type mediaExpertJSONLDOffers struct {
	Price         json.Number `json:"price"`
	PriceCurrency string      `json:"priceCurrency"`
	Availability  string      `json:"availability"`
}

type mediaExpertJSONLDBrand struct {
	Name string `json:"name"`
}

var mediaExpertUnavailableMarkers = []string{
	"Produkt chwilowo niedostępny w sklepie internetowym",
	"Produkt chwilowo niedostępny",
	"Produkt niedostępny",
	"Powiadom mnie, gdy produkt będzie dostępny",
}

type MediaExpertScraper struct {
	userAgent    string
	requestDelay time.Duration
}

func NewMediaExpertScraper(userAgent string, requestDelay time.Duration) *MediaExpertScraper {
	return &MediaExpertScraper{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (s *MediaExpertScraper) StoreName() string {
	return "mediaexpert"
}

func (s *MediaExpertScraper) ScrapeProduct(url string) (*ScrapeResult, error) {
	var result ScrapeResult
	var scrapeErr error
	result.Currency = "PLN"
	result.IsAvailable = true

	c := colly.NewCollector(
		colly.AllowedDomains("www.mediaexpert.pl", "mediaexpert.pl"),
		colly.UserAgent(s.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*mediaexpert.pl*",
		Delay:       s.requestDelay,
		RandomDelay: 500 * time.Millisecond,
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
		log.Printf("[mediaexpert] Scraping: %s", r.URL.String())
	})

	c.OnResponse(func(r *colly.Response) {
		body := string(r.Body)
		bodyLower := strings.ToLower(body)

		if strings.Contains(body, "cf-turnstile-response") || strings.Contains(body, "potwierdzenie, że nie jesteś robotem") {
			scrapeErr = fmt.Errorf("mediaexpert anti-bot challenge returned for %s", r.Request.URL)
			return
		}

		for _, marker := range mediaExpertUnavailableMarkers {
			if strings.Contains(body, marker) {
				result.IsAvailable = false
				break
			}
		}

		if strings.Contains(body, "Do koszyka") || strings.Contains(body, "DO KOSZYKA") {
			result.IsAvailable = true
		}
		if strings.Contains(bodyLower, "powiadom") && !strings.Contains(bodyLower, "do koszyka") {
			result.IsAvailable = false
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

		var product mediaExpertJSONLDProduct
		if err := json.Unmarshal([]byte(e.Text), &product); err != nil {
			log.Printf("[mediaexpert] failed to parse JSON-LD Product: %v", err)
			return
		}

		if result.ProductName == "" {
			result.ProductName = strings.TrimSpace(product.Name)
		}
		if result.Currency == "" && product.Offers.PriceCurrency != "" {
			result.Currency = product.Offers.PriceCurrency
		}
		if result.Price == 0 && product.Offers.Price != "" {
			price, err := product.Offers.Price.Float64()
			if err != nil {
				log.Printf("[mediaexpert] failed to parse JSON-LD price %q: %v", product.Offers.Price, err)
			} else {
				result.Price = price
			}
		}
		if len(product.Image) > 0 && result.ImageURL == "" {
			result.ImageURL = product.Image[0]
		}

		if product.Offers.Availability != "" {
			result.IsAvailable = parseMediaExpertAvailability(product.Offers.Availability)
		}
	})

	c.OnHTML(`meta[property="product:price:amount"]`, func(e *colly.HTMLElement) {
		content := strings.TrimSpace(e.Attr("content"))
		if content == "" {
			return
		}
		price, err := strconv.ParseFloat(content, 64)
		if err != nil {
			log.Printf("[mediaexpert] failed to parse meta price %q: %v", content, err)
			return
		}
		result.Price = price
	})

	c.OnHTML(`meta[property="product:price:currency"]`, func(e *colly.HTMLElement) {
		if content := strings.TrimSpace(e.Attr("content")); content != "" {
			result.Currency = content
		}
	})

	c.OnHTML(`meta[property="product:availability"]`, func(e *colly.HTMLElement) {
		content := strings.TrimSpace(e.Attr("content"))
		if content == "" {
			return
		}
		result.IsAvailable = parseMediaExpertAvailability(content)
	})

	c.OnHTML(`meta[property="og:title"]`, func(e *colly.HTMLElement) {
		content := strings.TrimSpace(e.Attr("content"))
		if content == "" {
			return
		}
		content = html.UnescapeString(content)
		parts := strings.SplitN(content, " - ", 2)
		result.ProductName = strings.TrimSpace(parts[0])
	})

	c.OnHTML(`meta[property="og:image"]`, func(e *colly.HTMLElement) {
		if content := strings.TrimSpace(e.Attr("content")); content != "" {
			result.ImageURL = content
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		statusCode := 0
		bodySize := 0
		requestURL := url
		if r != nil {
			statusCode = r.StatusCode
			bodySize = len(r.Body)
			requestURL = r.Request.URL.String()
		}
		log.Printf("[mediaexpert] HTTP %d for %s (body: %d bytes)", statusCode, requestURL, bodySize)
		scrapeErr = fmt.Errorf("HTTP %d for %s: %w", statusCode, requestURL, err)
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

func parseMediaExpertAvailability(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))

	switch {
	case normalized == "":
		return true
	case strings.Contains(normalized, "notavailable"):
		return false
	case strings.Contains(normalized, "outofstock"):
		return false
	case strings.Contains(normalized, "soldout"):
		return false
	case strings.Contains(normalized, "discontinued"):
		return false
	case strings.Contains(normalized, "instock"):
		return true
	case strings.Contains(normalized, "available"):
		return true
	default:
		return true
	}
}
