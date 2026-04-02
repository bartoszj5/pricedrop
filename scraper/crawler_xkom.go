package main

import (
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

var xkomProductRegex = regexp.MustCompile(`/p/\d+`)

type XKomCrawler struct {
	userAgent    string
	requestDelay time.Duration
}

func NewXKomCrawler(userAgent string, requestDelay time.Duration) *XKomCrawler {
	return &XKomCrawler{
		userAgent:    userAgent,
		requestDelay: requestDelay,
	}
}

func (cr *XKomCrawler) StoreName() string { return "x-kom" }

func (cr *XKomCrawler) DefaultCategories() map[string]string {
	return map[string]string{
		// Podzespoły komputerowe
		"gpu":              "https://www.x-kom.pl/g-5/c/345-karty-graficzne.html",
		"gpu-nvidia":       "https://www.x-kom.pl/g-5/c/346-karty-graficzne-nvidia.html",
		"gpu-amd":          "https://www.x-kom.pl/g-5/c/22-karty-graficzne-amd.html",
		"cpu":              "https://www.x-kom.pl/g-5/c/11-procesory.html",
		"motherboard":      "https://www.x-kom.pl/g-5/c/14-plyty-glowne.html",
		"ram":              "https://www.x-kom.pl/g-5/c/28-pamieci-ram.html",
		"ssd":              "https://www.x-kom.pl/g-5/c/1779-dyski-ssd.html",
		"hdd":              "https://www.x-kom.pl/g-5/c/1580-dyski-hdd.html",
		"psu":              "https://www.x-kom.pl/g-5/c/158-zasilacze-do-komputera.html",
		"case":             "https://www.x-kom.pl/g-5/c/389-obudowy-do-komputera.html",
		"cooling":          "https://www.x-kom.pl/g-5/c/2599-chlodzenia-komputerowe.html",
		"cooling-aio":      "https://www.x-kom.pl/g-5/c/2650-chlodzenia-wodne.html",
		"cooling-air":      "https://www.x-kom.pl/g-5/c/105-chlodzenia-procesorow.html",
		// Laptopy i komputery
		"laptop":           "https://www.x-kom.pl/g-2/c/159-laptopy-notebooki-ultrabooki.html",
		"desktop":          "https://www.x-kom.pl/g-2/c/175-komputery-stacjonarne.html",
		"tablet":           "https://www.x-kom.pl/g-2/c/1663-tablety.html",
		// Smartfony i smartwatche
		"smartphone":       "https://www.x-kom.pl/g-4/c/1590-smartfony-i-telefony.html",
		"smartwatch":       "https://www.x-kom.pl/g-4/c/2435-smartwatche.html",
		"ebook-reader":     "https://www.x-kom.pl/g-4/c/2519-czytniki-ebook.html",
		// Gaming i streaming
		"console":          "https://www.x-kom.pl/g-7/c/2384-konsole.html",
		"console-ps":       "https://www.x-kom.pl/g-7/c/2572-konsole-playstation.html",
		"console-xbox":     "https://www.x-kom.pl/g-7/c/2571-konsole-xbox.html",
		"console-nintendo": "https://www.x-kom.pl/g-7/c/2573-konsole-nintendo.html",
		"console-handheld": "https://www.x-kom.pl/g-7/c/4048-konsole-mobilne.html",
		"game-ps5":         "https://www.x-kom.pl/g-7/c/3106-gry-na-playstation-5.html",
		"game-xbox":        "https://www.x-kom.pl/g-7/c/3107-gry-na-xbox-series-x-s.html",
		"game-switch":      "https://www.x-kom.pl/g-7/c/2536-gry-na-switch.html",
		"game-pc":          "https://www.x-kom.pl/g-7/c/1686-gry-na-pc.html",
		"gamepad":          "https://www.x-kom.pl/g-7/c/170-pady.html",
		"gaming-mouse":     "https://www.x-kom.pl/g-7/c/2387-myszy-bezprzewodowe-dla-graczy.html",
		"gaming-keyboard":  "https://www.x-kom.pl/g-7/c/2389-klawiatury-dla-graczy.html",
		"gaming-headset":   "https://www.x-kom.pl/g-7/c/2499-sluchawki-dla-graczy.html",
		"gaming-monitor":   "https://www.x-kom.pl/g-7/c/2371-monitory-dla-graczy.html",
		"gaming-chair":     "https://www.x-kom.pl/g-7/c/2444-fotele-gamingowe.html",
		"vr":               "https://www.x-kom.pl/g-7/c/2589-gogle-vr.html",
		"steering-wheel":   "https://www.x-kom.pl/g-7/c/164-kierownice.html",
		// Urządzenia peryferyjne
		"monitor":          "https://www.x-kom.pl/g-6/c/15-monitory.html",
		"printer":          "https://www.x-kom.pl/g-6/c/6-drukarki.html",
		"router":           "https://www.x-kom.pl/g-6/c/495-routery.html",
		"headphones":       "https://www.x-kom.pl/g-6/c/2495-sluchawki-bezprzewodowe.html",
		// TV i audio
		"tv":               "https://www.x-kom.pl/g-8/c/1117-telewizory.html",
		"soundbar":         "https://www.x-kom.pl/g-8/c/1881-soundbary-do-tv.html",
		"projector":        "https://www.x-kom.pl/g-8/c/1749-projektory.html",
	}
}

func (cr *XKomCrawler) CrawlCategory(categoryURL string, maxPages int) ([]DiscoveredProduct, error) {
	var allProducts []DiscoveredProduct
	seen := make(map[string]int) // URL → index in allProducts

	for page := 1; page <= maxPages; page++ {
		pageURL := addPageParam(categoryURL, page)
		before := len(allProducts)

		products, err := cr.crawlPage(pageURL, seen, &allProducts)
		if err != nil {
			log.Printf("[x-kom/crawl] Error on page %d of %s: %v", page, categoryURL, err)
			break
		}
		allProducts = products

		newOnPage := len(allProducts) - before
		log.Printf("[x-kom/crawl] Page %d: %d new products (total %d)", page, newOnPage, len(allProducts))

		if newOnPage == 0 {
			break
		}
	}

	return allProducts, nil
}

func (cr *XKomCrawler) crawlPage(pageURL string, seen map[string]int, existing *[]DiscoveredProduct) ([]DiscoveredProduct, error) {
	products := *existing
	var crawlErr error

	c := colly.NewCollector(
		colly.AllowedDomains("www.x-kom.pl", "x-kom.pl"),
		colly.UserAgent(cr.userAgent),
		colly.IgnoreRobotsTxt(),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*x-kom.pl*",
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
		log.Printf("[x-kom/crawl] Visiting: %s", r.URL.String())
	})

	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		if !xkomProductRegex.MatchString(href) {
			return
		}

		fullURL := e.Request.AbsoluteURL(href)
		if fullURL == "" {
			return
		}
		// Strip query params and fragments for deduplication.
		if idx := strings.IndexAny(fullURL, "?#"); idx != -1 {
			fullURL = fullURL[:idx]
		}

		title := cleanLinkText(e.Text)

		if existIdx, ok := seen[fullURL]; ok {
			// Update title if we now have a better one.
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
		log.Printf("[x-kom/crawl] HTTP %d for %s", r.StatusCode, r.Request.URL)
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

// cleanLinkText removes excessive whitespace from link inner text.
func cleanLinkText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > 300 {
		return ""
	}
	return s
}
