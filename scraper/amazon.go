package main

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

type AmazonScraper struct {
	userAgent    string
	requestDelay time.Duration
}

func NewAmazonScraper(userAgent string, requestDelay time.Duration) *AmazonScraper {
	return &AmazonScraper{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (s *AmazonScraper) StoreName() string {
	return "amazon"
}

func (s *AmazonScraper) ScrapeProduct(url string) (*ScrapeResult, error) {
	var result ScrapeResult
	var scrapeErr error
	result.IsAvailable = true

	c := colly.NewCollector(
		colly.AllowedDomains("www.amazon.pl", "amazon.pl"),
		colly.UserAgent(s.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*amazon.pl*",
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
		log.Printf("[amazon] Scraping: %s", r.URL.String())
	})

	c.OnResponse(func(r *colly.Response) {
		body := string(r.Body)

		amazonUnavailableMarkers := []string{
			"Obecnie niedostępny",
			"obecnie niedostępny",
			"Currently unavailable",
			"Tymczasowo niedostępny",
		}
		for _, marker := range amazonUnavailableMarkers {
			if strings.Contains(body, marker) {
				log.Printf("[amazon] Unavailable: found %q in page", marker)
				result.IsAvailable = false
				break
			}
		}

		if strings.Contains(body, "Dodaj do koszyka") || strings.Contains(body, "Add to Cart") {
			result.IsAvailable = true
		}
	})

	// Product title: <span id="productTitle">
	c.OnHTML(`#productTitle`, func(e *colly.HTMLElement) {
		if result.ProductName != "" {
			return
		}
		name := strings.TrimSpace(e.Text)
		if name != "" {
			result.ProductName = name
		}
	})

	// Price from the buy-box: .a-price-whole and .a-price-fraction
	// The first .a-price on the page is typically the main product price.
	c.OnHTML(`#corePrice_feature_div .a-price .a-offscreen`, func(e *colly.HTMLElement) {
		if result.Price > 0 {
			return
		}
		priceText := strings.TrimSpace(e.Text)
		price, currency := parseAmazonPrice(priceText)
		if price > 0 {
			result.Price = price
			if currency != "" {
				result.Currency = currency
			}
		}
	})

	// Fallback: price from the desktop buy box.
	c.OnHTML(`#apex_desktop .a-price .a-offscreen`, func(e *colly.HTMLElement) {
		if result.Price > 0 {
			return
		}
		priceText := strings.TrimSpace(e.Text)
		price, currency := parseAmazonPrice(priceText)
		if price > 0 {
			result.Price = price
			if currency != "" {
				result.Currency = currency
			}
		}
	})

	// Availability text: <div id="availability">
	c.OnHTML(`#availability span`, func(e *colly.HTMLElement) {
		text := strings.TrimSpace(e.Text)
		if text == "" {
			return
		}
		lower := strings.ToLower(text)
		if strings.Contains(lower, "niedostępny") || strings.Contains(lower, "unavailable") {
			result.IsAvailable = false
		}
	})

	// Product image: <img id="landingImage">
	c.OnHTML(`#landingImage`, func(e *colly.HTMLElement) {
		if result.ImageURL != "" {
			return
		}
		if src := e.Attr("src"); src != "" {
			result.ImageURL = src
		}
	})

	// Fallback image from imgBlkFront.
	c.OnHTML(`#imgBlkFront`, func(e *colly.HTMLElement) {
		if result.ImageURL != "" {
			return
		}
		if src := e.Attr("src"); src != "" {
			result.ImageURL = src
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[amazon] HTTP %d for %s (body: %d bytes)", r.StatusCode, r.Request.URL, len(r.Body))
		scrapeErr = fmt.Errorf("HTTP %d for %s: %w", r.StatusCode, r.Request.URL, err)
	})

	if err := c.Visit(url); err != nil {
		return nil, fmt.Errorf("visiting %s: %w", url, err)
	}

	if scrapeErr != nil {
		return nil, scrapeErr
	}

	if result.Currency == "" {
		result.Currency = "PLN"
	}

	if result.ProductName == "" && result.Price == 0 {
		return nil, fmt.Errorf("no product data found at %s", url)
	}

	return &result, nil
}

// parseAmazonPrice parses Amazon price strings like "399,00zł" or "1 299,99 zł".
func parseAmazonPrice(text string) (float64, string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return 0, ""
	}

	var currency string
	if strings.Contains(text, "zł") {
		currency = "PLN"
		text = strings.ReplaceAll(text, "zł", "")
	} else if strings.Contains(text, "€") {
		currency = "EUR"
		text = strings.ReplaceAll(text, "€", "")
	}

	// Remove non-breaking spaces and regular spaces used as thousands separator.
	text = strings.ReplaceAll(text, "\u00a0", "")
	text = strings.ReplaceAll(text, " ", "")
	// Replace comma decimal separator with dot.
	text = strings.ReplaceAll(text, ",", ".")
	text = strings.TrimSpace(text)

	price, err := strconv.ParseFloat(text, 64)
	if err != nil {
		log.Printf("[amazon] failed to parse price %q: %v", text, err)
		return 0, currency
	}

	return price, currency
}
