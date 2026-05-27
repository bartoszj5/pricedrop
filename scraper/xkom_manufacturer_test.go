package main

import "testing"

func TestSkuLooksLikeInternalShopID(t *testing.T) {
	if !skuLooksLikeInternalShopID("1234567890") {
		t.Fatalf("expected numeric SKU to look like internal id")
	}
	if skuLooksLikeInternalShopID("12345A") {
		t.Fatalf("expected alphanumeric SKU to not match internal id")
	}
}

func TestExtractXKomManufacturerCodeFromHTML(t *testing.T) {
	html := `
		<script type="application/ld+json">{"mpn":"MPN-123"}</script>
		<table><tr><td>Kod producenta</td><td>SHOULD-NOT-USE</td></tr></table>
	`
	got := extractXKomManufacturerCodeFromHTML(html)
	if got != "MPN-123" {
		t.Fatalf("unexpected manufacturer code: %q", got)
	}

	html = `<dt>Kod producenta</dt><dd>ABC-999</dd>`
	got = extractXKomManufacturerCodeFromHTML(html)
	if got != "ABC-999" {
		t.Fatalf("unexpected manufacturer code from dt/dd: %q", got)
	}
}

func TestTruncateManufacturerCode(t *testing.T) {
	long := make([]byte, 140)
	for i := range long {
		long[i] = 'A'
	}
	got := truncateManufacturerCode(string(long))
	if len(got) != 128 {
		t.Fatalf("expected truncated length 128, got %d", len(got))
	}
}
