package main

import (
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

// morele product URLs end with a numeric ID, e.g. /karta-graficzna-...-12345678/
var moreleProductRegex = regexp.MustCompile(`^https?://(?:www\.)?morele\.net/[a-z0-9][\w-]+-\d+/?$`)

type MoreleCrawler struct {
	userAgent    string
	requestDelay time.Duration
}

func NewMoreleCrawler(userAgent string, requestDelay time.Duration) *MoreleCrawler {
	return &MoreleCrawler{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (cr *MoreleCrawler) StoreName() string { return "morele" }

func (cr *MoreleCrawler) DefaultCategories() map[string]string {
	return map[string]string{
		// Podzespoły komputerowe
		"gpu":         "https://www.morele.net/kategoria/karty-graficzne-12/",
		"cpu":         "https://www.morele.net/kategoria/procesory-45/",
		"motherboard": "https://www.morele.net/kategoria/plyty-glowne-42/",
		"ram":         "https://www.morele.net/kategoria/pamieci-ram-38/",
		"ssd":         "https://www.morele.net/kategoria/dyski-ssd-518/",
		"hdd":         "https://www.morele.net/kategoria/dyski-hdd-4/",
		"psu":         "https://www.morele.net/kategoria/zasilacze-komputerowe-61/",
		"case":        "https://www.morele.net/kategoria/obudowy-33/",
		"cooling-cpu": "https://www.morele.net/kategoria/chlodzenie-cpu-633/",
		"cooling-aio": "https://www.morele.net/kategoria/chlodzenie-wodne-zestawy-662/",
		// Laptopy i komputery
		"laptop":       "https://www.morele.net/kategoria/laptopy-31/",
		"tablet":       "https://www.morele.net/kategoria/tablety-528/",
		"ebook-reader": "https://www.morele.net/kategoria/czytniki-e-book-542/",
		// Peryferia
		"monitor":          "https://www.morele.net/kategoria/monitory-523/",
		"keyboard":         "https://www.morele.net/kategoria/klawiatury-18/",
		"mouse":            "https://www.morele.net/kategoria/myszki-464/",
		"headphones-bt":    "https://www.morele.net/kategoria/sluchawki-bezprzewodowe-458/",
		"headphones-wired": "https://www.morele.net/kategoria/sluchawki-nauszne-780/",
		"speaker-bt":       "https://www.morele.net/kategoria/glosniki-bluetooth-677/",
		"speaker-pc":       "https://www.morele.net/kategoria/glosniki-komputerowe-6/",
		"webcam":           "https://www.morele.net/kategoria/kamery-internetowe-43/",
		"microphone":       "https://www.morele.net/kategoria/mikrofony-456/",
		"printer-inkjet":   "https://www.morele.net/kategoria/drukarki-atramentowe-269/",
		"printer-laser":    "https://www.morele.net/kategoria/drukarki-laserowe-279/",
		"printer-3d":       "https://www.morele.net/kategoria/drukarki-3d-712/",
		"router":           "https://www.morele.net/kategoria/routery-48/",
		"pendrive":         "https://www.morele.net/kategoria/pendrive-8/",
		"memory-card":      "https://www.morele.net/kategoria/karty-pamieci-626/",
		// Gaming
		"gaming-keyboard":  "https://www.morele.net/kategoria/klawiatury-gamingowe-465/",
		"gaming-mouse":     "https://www.morele.net/kategoria/myszki-gamingowe-27/",
		"gaming-headset":   "https://www.morele.net/kategoria/sluchawki-gamingowe-466/",
		"gamepad":          "https://www.morele.net/kategoria/pady-10/",
		"console-handheld": "https://www.morele.net/kategoria/konsole-przenosne-489/",
		"console-retro":    "https://www.morele.net/kategoria/konsole-retro-12184/",
		// Smartfony i zegarki
		"smartphone": "https://www.morele.net/kategoria/smartfony-280/",
		"smartwatch": "https://www.morele.net/kategoria/smartwatche-732/",
		"powerbank":  "https://www.morele.net/kategoria/powerbanki-584/",
		// RTV
		"tv":             "https://www.morele.net/kategoria/telewizory-412/",
		"tablet-graphic": "https://www.morele.net/kategoria/tablety-graficzne-54/",
	}
}

func (cr *MoreleCrawler) CrawlCategory(categoryURL string, maxPages int) ([]DiscoveredProduct, error) {
	var allProducts []DiscoveredProduct
	seen := make(map[string]int)

	for page := 1; page <= maxPages; page++ {
		pageURL := addPagePath(categoryURL, page)
		before := len(allProducts)

		products, err := cr.crawlPage(pageURL, seen, &allProducts)
		if err != nil {
			log.Printf("[morele/crawl] Error on page %d of %s: %v", page, categoryURL, err)
			break
		}
		allProducts = products

		newOnPage := len(allProducts) - before
		log.Printf("[morele/crawl] Page %d: %d new products (total %d)", page, newOnPage, len(allProducts))

		if newOnPage == 0 {
			break
		}
	}

	return allProducts, nil
}

func (cr *MoreleCrawler) crawlPage(pageURL string, seen map[string]int, existing *[]DiscoveredProduct) ([]DiscoveredProduct, error) {
	products := *existing
	var crawlErr error

	c := colly.NewCollector(
		colly.AllowedDomains("www.morele.net", "morele.net"),
		colly.UserAgent(cr.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*morele.net*",
		Delay:       cr.requestDelay,
		RandomDelay: 500 * time.Millisecond,
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
		log.Printf("[morele/crawl] Visiting: %s", r.URL.String())
	})

	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		href := e.Attr("href")

		fullURL := e.Request.AbsoluteURL(href)
		if fullURL == "" {
			return
		}
		// Strip query params and fragments.
		if idx := strings.IndexAny(fullURL, "?#"); idx != -1 {
			fullURL = fullURL[:idx]
		}
		// Ensure trailing slash for consistent dedup.
		if !strings.HasSuffix(fullURL, "/") {
			fullURL += "/"
		}

		if !moreleProductRegex.MatchString(fullURL) {
			return
		}

		title := cleanLinkText(e.Text)

		if existIdx, ok := seen[fullURL]; ok {
			if title != "" && products[existIdx].Title == "" {
				products[existIdx].Title = title
			}
			return
		}

		seen[fullURL] = len(products)
		products = append(products, DiscoveredProduct{
			URL:   fullURL,
			Title: title,
		})
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[morele/crawl] HTTP %d for %s", r.StatusCode, r.Request.URL)
		crawlErr = err
	})

	if err := c.Visit(pageURL); err != nil {
		return products, err
	}
	if crawlErr != nil {
		return products, crawlErr
	}

	return products, nil
}
