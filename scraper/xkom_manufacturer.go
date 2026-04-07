package main

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	reXKomJSONMPN           = regexp.MustCompile(`(?i)"mpn"\s*:\s*"([^"]+)"`)
	reXKomJSONSKU           = regexp.MustCompile(`(?i)"sku"\s*:\s*"([^"]+)"`)
	reXKomJSONMfrKeys       = []*regexp.Regexp{
		regexp.MustCompile(`(?i)"manufacturerCode"\s*:\s*"([^"]+)"`),
		regexp.MustCompile(`(?i)"manufacturerPartNumber"\s*:\s*"([^"]+)"`),
		regexp.MustCompile(`(?i)"producerCode"\s*:\s*"([^"]+)"`),
		regexp.MustCompile(`(?i)"producerArticleNumber"\s*:\s*"([^"]+)"`),
	}
	// Spec table / CSR markup variants (legacy cell adjacency + dt/dd).
	reXKomKodProducentaCell = regexp.MustCompile(`(?is)Kod\s+producenta\s*</[^>]+>\s*<[^>]+>\s*([^<]+)`)
	reXKomKodProducentaDTDD = regexp.MustCompile(`(?is)<dt[^>]*>\s*Kod\s+producenta\s*</dt>\s*<dd[^>]*>\s*([^<]+)`)
	reXKomKodProducentaRow  = regexp.MustCompile(`(?is)Kod\s+producenta\s*</(?:td|th)[^>]*>\s*<(?:td|th)[^>]*>\s*([^<]+)`)
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
	try := func(s string) string {
		s = strings.TrimSpace(s)
		if s == "" || skuLooksLikeInternalShopID(s) {
			return ""
		}
		return truncateManufacturerCode(s)
	}
	if m := reXKomJSONMPN.FindStringSubmatch(body); len(m) > 1 {
		if c := try(m[1]); c != "" {
			return c
		}
	}
	for _, re := range reXKomJSONMfrKeys {
		if m := re.FindStringSubmatch(body); len(m) > 1 {
			if c := try(m[1]); c != "" {
				return c
			}
		}
	}
	if m := reXKomJSONSKU.FindStringSubmatch(body); len(m) > 1 {
		if c := try(m[1]); c != "" {
			return c
		}
	}
	for _, re := range []*regexp.Regexp{reXKomKodProducentaCell, reXKomKodProducentaDTDD, reXKomKodProducentaRow} {
		if m := re.FindStringSubmatch(body); len(m) > 1 {
			if c := try(m[1]); c != "" {
				return c
			}
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
