package main

import "testing"

func TestMediaExpertQueryFromProductURL(t *testing.T) {
	q, err := mediaExpertQueryFromProductURL("https://www.mediaexpert.pl/komputery-i-tablety/laptop-abc-123.html")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if q != "laptop abc 123" {
		t.Fatalf("unexpected query: %q", q)
	}
}

func TestNormalizeMediaExpertURL(t *testing.T) {
	got := normalizeMediaExpertURL("https://www.mediaexpert.pl/komputery-i-tablety/Laptop-ABC-123.html?ref=foo")
	if got != "mediaexpert.pl/komputery-i-tablety/laptop-abc-123.html" {
		t.Fatalf("unexpected normalized URL: %q", got)
	}
}

func TestMediaExpertURLStem(t *testing.T) {
	got := mediaExpertURLStem("https://www.mediaexpert.pl/komputery-i-tablety/laptop-abc-123.html")
	if got != "laptop abc" {
		t.Fatalf("unexpected stem: %q", got)
	}
}

func TestManufacturerCodeFromMediaExpertItem(t *testing.T) {
	item := mediaExpertSearchItem{Attributes: map[string]string{"Kod producenta": "ABCD-1234"}}
	if got := manufacturerCodeFromMediaExpertItem(item); got != "ABCD-1234" {
		t.Fatalf("unexpected manufacturer code: %q", got)
	}
}

func TestScrapeResultFromMediaExpertSearchItem(t *testing.T) {
	item := mediaExpertSearchItem{
		Link:      "/komputery-i-tablety/laptop-abc-123.html",
		Title:     "Laptop ABC 123",
		ImageLink: "https://img.example/1.png",
		Price:     mediaExpertSearchPrice{Value: 1999.99},
		Attributes: map[string]string{
			"Kod producenta": "ABCD-1234",
		},
	}

	res, url, err := scrapeResultFromMediaExpertSearchItem(&item)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if url != "https://www.mediaexpert.pl/komputery-i-tablety/laptop-abc-123.html" {
		t.Fatalf("unexpected url: %q", url)
	}
	if res.ProductName != "Laptop ABC 123" {
		t.Fatalf("unexpected product name: %q", res.ProductName)
	}
	if res.ManufacturerCode != "ABCD-1234" {
		t.Fatalf("unexpected manufacturer code: %q", res.ManufacturerCode)
	}
}
