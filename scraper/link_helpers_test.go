package main

import "testing"

func TestTruncateSearchQueryStripsSymbols(t *testing.T) {
	got := truncateSearchQuery("Super\u2122 Widget\u00a0Pro", 100)
	if got != "Super Widget Pro" {
		t.Fatalf("expected stripped query, got %q", got)
	}
}

func TestTruncateSearchQueryShortens(t *testing.T) {
	got := truncateSearchQuery("One Two Three", 7)
	if got != "One Two" {
		t.Fatalf("expected truncated query, got %q", got)
	}
}

func TestManufacturerCodesCompatible(t *testing.T) {
	if !manufacturerCodesCompatible("ABC-123", "abc123") {
		t.Fatalf("expected codes to be compatible")
	}
	if !manufacturerCodesCompatible("1234", "XX1234YY") {
		t.Fatalf("expected substring codes to be compatible")
	}
	if manufacturerCodesCompatible("AB12", "AB") {
		t.Fatalf("expected short mismatch to be incompatible")
	}
}

func TestTitleTokenJaccard(t *testing.T) {
	a := "Monitor LG UltraGear 34G600A-B"
	b := "LG UltraGear 34G600A-B"
	score := titleTokenJaccard(a, b)
	if score < 0.9 {
		t.Fatalf("expected high similarity, got %f", score)
	}
}

func TestSearchQueriesForProduct(t *testing.T) {
	pr := ProductToLink{Title: "Example Widget 123", ManufacturerCode: "ABC-123"}
	queries := searchQueriesForProduct("x-kom", pr)
	if len(queries) != 2 {
		t.Fatalf("expected 2 queries, got %d", len(queries))
	}
	if queries[0] == queries[1] {
		t.Fatalf("expected distinct queries")
	}
}

func TestTitleTokensIgnoreShortParts(t *testing.T) {
	tokens := titleTokens("a b c")
	if len(tokens) != 0 {
		t.Fatalf("expected no tokens, got %d", len(tokens))
	}
}
