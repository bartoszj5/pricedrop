package main

import (
	"fmt"
	"log"
	"strings"
)

// MediaExpertCrawler uses the Synerise search API to discover products by category keyword.
type MediaExpertCrawler struct {
	scraper *MediaExpertScraper // reuses the search HTTP client
}

func NewMediaExpertCrawler(scraper *MediaExpertScraper) *MediaExpertCrawler {
	return &MediaExpertCrawler{scraper: scraper}
}

func (cr *MediaExpertCrawler) StoreName() string { return "mediaexpert" }

func (cr *MediaExpertCrawler) DefaultCategories() map[string]string {
	// For Media Expert the value is a search keyword used with their Synerise API.
	return map[string]string{
		// Podzespoły komputerowe
		"gpu":              "karty graficzne",
		"cpu":              "procesory",
		"motherboard":      "płyty główne",
		"ram":              "pamięci RAM",
		"ssd":              "dyski SSD",
		"psu":              "zasilacze komputerowe",
		"case":             "obudowy komputerowe",
		"cooling":          "chłodzenie komputerowe",
		// Laptopy i komputery
		"laptop":           "laptopy i ultrabooki",
		"desktop":          "komputery PC",
		"tablet":           "tablety i e-booki",
		// Smartfony i zegarki
		"smartphone":       "smartfony i telefony",
		"smartwatch":       "smartwatche i zegarki",
		// Peryferia
		"monitor":          "monitory LED",
		"keyboard":         "klawiatury komputerowe",
		"mouse":            "myszki komputerowe",
		"headphones":       "słuchawki",
		"printer":          "drukarki i urządzenia biurowe",
		"router":           "routery",
		"webcam":           "kamery internetowe",
		"microphone":       "mikrofony",
		// Gaming
		"console-ps":       "PlayStation 5",
		"console-xbox":     "Xbox Series",
		"console-nintendo": "Nintendo",
		"console-handheld": "konsole przenośne",
		"gamepad":          "kontrolery pady",
		"gaming-keyboard":  "klawiatury dla graczy",
		"gaming-mouse":     "myszki dla graczy",
		"gaming-headset":   "słuchawki gamingowe",
		"gaming-laptop":    "laptopy gamingowe",
		"gaming-monitor":   "monitory gamingowe",
		"gaming-chair":     "fotele gamingowe",
		"vr":               "okulary VR",
		"steering-wheel":   "kierownice do gier",
		// TV i audio
		"tv":               "telewizory",
		"soundbar":         "soundbary",
		"projector":        "projektory",
		"speaker-bt":       "głośniki Bluetooth",
		// Foto
		"camera":           "aparaty fotograficzne",
		"drone":            "drony i akcesoria",
	}
}

func (cr *MediaExpertCrawler) CrawlCategory(categoryQuery string, maxPages int) ([]DiscoveredProduct, error) {
	// maxPages is used as a multiplier for the result limit.
	limit := maxPages * 50
	if limit < 50 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	log.Printf("[mediaexpert/crawl] Searching %q (limit %d)", categoryQuery, limit)

	items, err := cr.scraper.search(categoryQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("mediaexpert search %q: %w", categoryQuery, err)
	}

	seen := make(map[string]bool)
	var products []DiscoveredProduct

	for _, item := range items {
		link := strings.TrimSpace(item.Link)
		if link == "" {
			continue
		}
		if !strings.HasPrefix(link, "http") {
			link = "https://www.mediaexpert.pl" + link
		}

		if seen[link] {
			continue
		}
		seen[link] = true

		products = append(products, DiscoveredProduct{
			URL:      link,
			Title:    strings.TrimSpace(item.Title),
			Price:    item.Price.Value,
			Currency: "PLN",
			ImageURL: strings.TrimSpace(item.ImageLink),
		})
	}

	log.Printf("[mediaexpert/crawl] Found %d products for %q", len(products), categoryQuery)
	return products, nil
}
