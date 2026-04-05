package main

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	reXKomJSONMPN           = regexp.MustCompile(`(?i)"mpn"\s*:\s*"([^"]+)"`)
	reXKomJSONSKU           = regexp.MustCompile(`(?i)"sku"\s*:\s*"([^"]+)"`)
	reXKomKodProducentaCell = regexp.MustCompile(`(?is)Kod\s+producenta\s*</[^>]+>\s*<[^>]+>\s*([^<]+)`)
)

// skuLooksLikeInternalShopID filters long numeric-only SKUs (often internal shop ids).
func skuLooksLikeInternalShopID(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 10 {
		return false
	}
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

// extractXKomManufacturerCodeFromHTML finds MPN / kod producenta outside strict JSON-LD parsing.
func extractXKomManufacturerCodeFromHTML(body string) string {
	if m := reXKomJSONMPN.FindStringSubmatch(body); len(m) > 1 {
		if c := strings.TrimSpace(m[1]); c != "" {
			return truncateManufacturerCode(c)
		}
	}
	if m := reXKomJSONSKU.FindStringSubmatch(body); len(m) > 1 {
		c := strings.TrimSpace(m[1])
		if c != "" && !skuLooksLikeInternalShopID(c) {
			return truncateManufacturerCode(c)
		}
	}
	if m := reXKomKodProducentaCell.FindStringSubmatch(body); len(m) > 1 {
		if c := strings.TrimSpace(m[1]); c != "" {
			return truncateManufacturerCode(c)
		}
	}
	return ""
}

func truncateManufacturerCode(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 128 {
		return s[:128]
	}
	return s
}
