package main

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"
)

// InvalidateAPICache fires a best-effort POST to the API's cache invalidation
// endpoint. Failures are logged, never propagated — cache is an optimisation,
// not a correctness requirement.
func (app *App) InvalidateAPICache() {
	base := strings.TrimRight(app.config.APIInternalURL, "/")
	if base == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	url := base + "/internal/cache/invalidate-products"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		log.Printf("[cache] build invalidation request: %v", err)
		return
	}
	if token := app.config.APIInternalToken; token != "" {
		req.Header.Set("X-Internal-Token", token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[cache] invalidation call failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("[cache] invalidation returned status %d", resp.StatusCode)
		return
	}
	log.Printf("[cache] api products cache invalidated")
}
