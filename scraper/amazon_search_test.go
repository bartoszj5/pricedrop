package main

import "testing"

func TestParseAmazonPrice(t *testing.T) {
	price, currency := parseAmazonPrice("1 299,99 zł")
	if currency != "PLN" {
		t.Fatalf("expected PLN, got %q", currency)
	}
	if price < 1299.98 || price > 1299.99 {
		t.Fatalf("unexpected price: %f", price)
	}

	price, currency = parseAmazonPrice("19,99 €")
	if currency != "EUR" {
		t.Fatalf("expected EUR, got %q", currency)
	}
	if price < 19.98 || price > 19.99 {
		t.Fatalf("unexpected EUR price: %f", price)
	}
}

func TestParseAmazonSearchHTML(t *testing.T) {
	body := []byte(`
		<div data-asin="B000123456" data-component-type="s-search-result">
			<h2 class="a-text-normal"><span>Title One</span></h2>
		</div>
		<div data-asin="B000999999" data-component-type="s-search-result">
			<h2 aria-label="Sponsored Ad — Title Two" class="a-text-normal"></h2>
		</div>
	`)

	hits := parseAmazonSearchHTML(body, 10)
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits, got %d", len(hits))
	}
	if hits[0].URL != "https://www.amazon.pl/dp/B000123456" {
		t.Fatalf("unexpected first URL: %q", hits[0].URL)
	}
	if hits[0].Title != "Title One" {
		t.Fatalf("unexpected first title: %q", hits[0].Title)
	}
	if hits[1].Title != "Title Two" {
		t.Fatalf("unexpected second title: %q", hits[1].Title)
	}
}

func TestPickBestAmazonHit(t *testing.T) {
	hits := []AmazonSearchHit{
		{URL: "https://www.amazon.pl/dp/AAA1111111", Title: "Unrelated Cable"},
		{URL: "https://www.amazon.pl/dp/BBB2222222", Title: "Logitech M720 Triathlon"},
	}

	best, _, ok := pickBestAmazonHit("Logitech M720 Triathlon", "M720", hits, "M720")
	if !ok {
		t.Fatalf("expected hit to be picked")
	}
	if best.URL != "https://www.amazon.pl/dp/BBB2222222" {
		t.Fatalf("unexpected best URL: %q", best.URL)
	}
}

func TestAmazonHitPassesMfrTitleGuard(t *testing.T) {
	hit := &AmazonSearchHit{Title: "Some random item"}
	if amazonHitPassesMfrTitleGuard("ABCD1234", hit, 0.59) {
		t.Fatalf("expected guard to fail for low score")
	}
	if !amazonHitPassesMfrTitleGuard("ABCD1234", hit, 0.61) {
		t.Fatalf("expected guard to pass for high score")
	}
}
