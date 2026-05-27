package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseLinkParamsDefaults(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://example.com/link/morele", nil)
	p := parseLinkParams(req, 0.45)

	if !p.DryRun {
		t.Fatalf("expected DryRun to default true")
	}
	if p.Probe {
		t.Fatalf("expected Probe to default false")
	}
	if p.Limit != 20 {
		t.Fatalf("expected Limit=20, got %d", p.Limit)
	}
	if p.MinScore != 0.45 {
		t.Fatalf("expected MinScore=0.45, got %f", p.MinScore)
	}
	if p.MaxCandidates != 25 {
		t.Fatalf("expected MaxCandidates=25, got %d", p.MaxCandidates)
	}
	if p.SourceStore != "x-kom" {
		t.Fatalf("expected SourceStore=x-kom, got %q", p.SourceStore)
	}
	if p.Category != "" {
		t.Fatalf("expected empty Category, got %q", p.Category)
	}
}

func TestParseLinkParamsOverrides(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"http://example.com/link/morele?dry_run=false&probe=1&limit=5&min_score=0.7&max_candidates=50&source=morele&category=laptops",
		nil,
	)
	p := parseLinkParams(req, 0.45)

	if p.DryRun {
		t.Fatalf("expected DryRun=false")
	}
	if !p.Probe {
		t.Fatalf("expected Probe=true")
	}
	if p.Limit != 5 {
		t.Fatalf("expected Limit=5, got %d", p.Limit)
	}
	if p.MinScore != 0.7 {
		t.Fatalf("expected MinScore=0.7, got %f", p.MinScore)
	}
	if p.MaxCandidates != 50 {
		t.Fatalf("expected MaxCandidates=50, got %d", p.MaxCandidates)
	}
	if p.SourceStore != "morele" {
		t.Fatalf("expected SourceStore=morele, got %q", p.SourceStore)
	}
	if p.Category != "laptops" {
		t.Fatalf("expected Category=laptops, got %q", p.Category)
	}
}

func TestParseLinkParamsInvalidValues(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet,
		"http://example.com/link/morele?limit=-2&min_score=1.5&max_candidates=0",
		nil,
	)
	p := parseLinkParams(req, 0.45)

	if p.Limit != 20 {
		t.Fatalf("expected Limit=20 on invalid input, got %d", p.Limit)
	}
	if p.MinScore != 0.45 {
		t.Fatalf("expected MinScore=0.45 on invalid input, got %f", p.MinScore)
	}
	if p.MaxCandidates != 25 {
		t.Fatalf("expected MaxCandidates=25 on invalid input, got %d", p.MaxCandidates)
	}
}
