package main

import "testing"

func TestMoreleURLStem(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want string
	}{
		{
			name: "keeps numeric model before product id",
			url:  "https://www.morele.net/karta-graficzna-rtx-4060-1234567/",
			want: "karta graficzna rtx 4060",
		},
		{
			name: "drops product id from fallback title",
			url:  "https://www.morele.net/laptop-foo-999999/",
			want: "laptop foo",
		},
		{
			name: "normalizes product slug text",
			url:  "https://www.morele.net/monitor-lg-ultragear-34g600a-b-1625341/",
			want: "monitor lg ultragear 34g600a b",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := moreleURLStem(tt.url)
			if got != tt.want {
				t.Fatalf("unexpected stem: got %q, want %q", got, tt.want)
			}
		})
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
