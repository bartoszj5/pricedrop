package main

import (
	"crypto/subtle"
	"net/http"
)

// requireInternalToken wraps a handler with X-Internal-Token auth.
// Fails closed: if APIInternalToken is unset the endpoint returns 503,
// so misconfiguration cannot silently expose the control plane.
func (app *App) requireInternalToken(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		expected := app.config.APIInternalToken
		if expected == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "admin api disabled: INTERNAL_API_TOKEN not set",
			})
			return
		}
		got := r.Header.Get("X-Internal-Token")
		if got == "" || subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid internal token",
			})
			return
		}
		h(w, r)
	}
}
