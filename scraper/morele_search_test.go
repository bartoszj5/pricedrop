package main

import "testing"

func TestMoreleURLStem(t *testing.T) {
	got := moreleURLStem("https://www.morele.net/karta-graficzna-rtx-4060-1234567/")
	if got != "karta graficzna rtx 4060" {
		t.Fatalf("unexpected stem: %q", got)
	}
}

func TestParseMoreleSearchHTML(t *testing.T) {
	body := []byte(`
		<div data-link-href-param="/karta-graficzna-rtx-4060-123456/" title="  Nvidia   RTX 4060  "></div>
		<div data-link-href-param="/karta-graficzna-rtx-4060-123456/" title="dup"></div>
		<div data-link-href-param="/not-a-product/" title="Skip"></div>
		<div data-link-href-param="/laptop-foo-999999/" title=""></div>
	`)

	hits := parseMoreleSearchHTML(body, 10)
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits, got %d", len(hits))
	}
	if hits[0].URL != "https://www.morele.net/karta-graficzna-rtx-4060-123456/" {
		t.Fatalf("unexpected first URL: %q", hits[0].URL)
	}
	if hits[0].Title != "Nvidia RTX 4060" {
		t.Fatalf("unexpected first title: %q", hits[0].Title)
	}
	if hits[1].Title != "laptop foo" {
		t.Fatalf("unexpected fallback title: %q", hits[1].Title)
	}
}

func TestPickBestMoreleHit(t *testing.T) {
	hits := []MoreleSearchHit{
		{URL: "https://www.morele.net/a-111/", Title: "Samsung Monitor"},
		{URL: "https://www.morele.net/b-222/", Title: "LG UltraGear 34G600A-B"},
	}
	best, _, ok := pickBestMoreleHit("LG UltraGear 34G600A-B", "", hits)
	if !ok {
		t.Fatalf("expected hit to be picked")
	}
	if best.URL != "https://www.morele.net/b-222/" {
		t.Fatalf("unexpected best URL: %q", best.URL)
	}
}
