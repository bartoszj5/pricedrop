package main

import "sync"

// jobGuard provides a non-blocking mutex for long-running background jobs.
// Only one goroutine can hold the guard at a time; additional callers get false from tryStart.
type jobGuard struct {
	mu      sync.Mutex
	running bool
}

func (g *jobGuard) tryStart() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.running {
		return false
	}
	g.running = true
	return true
}

func (g *jobGuard) finish() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.running = false
}
