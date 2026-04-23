package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// EmbeddingsClient talks to the Python sentence-transformer sidecar that returns
// cosine similarity scores between a query title and candidate titles.
type EmbeddingsClient struct {
	baseURL string
	timeout time.Duration
	http    *http.Client

	// disabledUntilUnix opens a short circuit breaker after a request error so we do
	// not stall subsequent pickBest* loops during an outage.
	disabledUntilUnix atomic.Int64
}

func NewEmbeddingsClient(baseURL string, timeout time.Duration) *EmbeddingsClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &EmbeddingsClient{
		baseURL: baseURL,
		timeout: timeout,
		http:    &http.Client{Timeout: timeout},
	}
}

type embeddingsSimilarityRequest struct {
	Query      string   `json:"query"`
	Candidates []string `json:"candidates"`
}

type embeddingsSimilarityResponse struct {
	Scores []float64 `json:"scores"`
}

type embeddingsEmbedRequest struct {
	Texts []string `json:"texts"`
}

type embeddingsEmbedResponse struct {
	Dim        int         `json:"dim"`
	Embeddings [][]float64 `json:"embeddings"`
}

// EmbeddingsBatchLimit matches the server's MAX_CANDIDATES (see embeddings/main.py).
const EmbeddingsBatchLimit = 100

const embeddingsCooldown = 30 * time.Second

func (c *EmbeddingsClient) isSuspended() bool {
	until := c.disabledUntilUnix.Load()
	return until > 0 && time.Now().Unix() < until
}

func (c *EmbeddingsClient) suspend() {
	c.disabledUntilUnix.Store(time.Now().Add(embeddingsCooldown).Unix())
}

// Similarity returns cosine similarity scores (0..1) of the query against each
// candidate title. Returns nil scores when the client is disabled or suspended.
func (c *EmbeddingsClient) Similarity(ctx context.Context, query string, candidates []string) ([]float64, error) {
	if c == nil {
		return nil, errors.New("embeddings client not configured")
	}
	if len(candidates) == 0 {
		return nil, nil
	}
	if c.isSuspended() {
		return nil, errors.New("embeddings client temporarily suspended after recent failure")
	}

	body, err := json.Marshal(embeddingsSimilarityRequest{Query: query, Candidates: candidates})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/similarity", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		c.suspend()
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		c.suspend()
		return nil, fmt.Errorf("embeddings %s: %s", resp.Status, strings.TrimSpace(string(rb)))
	}

	var out embeddingsSimilarityResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		c.suspend()
		return nil, err
	}
	if len(out.Scores) != len(candidates) {
		return nil, fmt.Errorf("embeddings returned %d scores for %d candidates", len(out.Scores), len(candidates))
	}
	return out.Scores, nil
}

// Embed returns normalised embedding vectors for up to EmbeddingsBatchLimit texts.
// Caller must page larger inputs. Unlike Similarity, this does not touch the circuit
// breaker — callers doing large sweeps (audit, bulk linking) need to proceed even when
// a single batch fails, and handle fallbacks themselves.
// batchTimeout overrides the default client timeout for this one call (useful for cold
// starts / 100-text batches that legitimately take >5s); pass 0 to use the default.
func (c *EmbeddingsClient) Embed(ctx context.Context, texts []string, batchTimeout time.Duration) ([][]float64, error) {
	if c == nil {
		return nil, errors.New("embeddings client not configured")
	}
	if len(texts) == 0 {
		return nil, nil
	}
	if len(texts) > EmbeddingsBatchLimit {
		return nil, fmt.Errorf("embed batch too large: %d (max %d)", len(texts), EmbeddingsBatchLimit)
	}

	body, err := json.Marshal(embeddingsEmbedRequest{Texts: texts})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := c.http
	if batchTimeout > 0 && batchTimeout != c.timeout {
		client = &http.Client{Timeout: batchTimeout}
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embeddings /embed %s: %s", resp.Status, strings.TrimSpace(string(rb)))
	}

	var out embeddingsEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Embeddings) != len(texts) {
		return nil, fmt.Errorf("embeddings /embed returned %d vectors for %d texts", len(out.Embeddings), len(texts))
	}
	return out.Embeddings, nil
}

// embeddingsClient is the package-level client used by the linker helpers.
// Nil means semantic scoring is disabled and callers fall back to Jaccard.
var embeddingsClient *EmbeddingsClient

// titleSimilarityScores returns a similarity score in [0,1] for each candidate
// against query. When the embeddings service is configured and healthy, scores
// are the max of the embedding cosine similarity and the Jaccard token overlap,
// so we never regress below the old lexical signal. Otherwise Jaccard only.
func titleSimilarityScores(query string, candidates []string) []float64 {
	out := make([]float64, len(candidates))
	for i, c := range candidates {
		out[i] = titleTokenJaccard(query, c)
	}
	if embeddingsClient == nil || len(candidates) == 0 {
		return out
	}

	ctx, cancel := context.WithTimeout(context.Background(), embeddingsClient.timeout)
	defer cancel()

	scores, err := embeddingsClient.Similarity(ctx, query, candidates)
	if err != nil {
		log.Printf("[embeddings] fallback to jaccard: %v", err)
		return out
	}
	for i, s := range scores {
		if s > out[i] {
			out[i] = s
		}
	}
	return out
}
