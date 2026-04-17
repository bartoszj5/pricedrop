package main

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL string
	RedisURL    string
	RabbitMQURL string
	Port        string
	// Scheduler intervals (time.ParseDuration format, e.g. "6h", "30m").
	ScrapeInterval time.Duration
	CrawlInterval  time.Duration
	// Scraper settings
	RequestDelay time.Duration
	// MoreleSearchDelay is the pause before each /wyszukiwarka/ HTTP request (link-morele and similar).
	// Kept separate from RequestDelay so heavy page scraping can stay polite while search stays fast.
	// Default 0; set MORELE_SEARCH_DELAY_MS e.g. 350 if Morele rate-limits you.
	MoreleSearchDelay time.Duration
	// AmazonSearchDelay is the pause before each /s?k= search GET (link-amazon).
	AmazonSearchDelay time.Duration
	UserAgent         string
	// APIInternalURL points at the PriceDrop API and is used for cache invalidation
	// after scrape/crawl runs. Empty disables invalidation calls.
	APIInternalURL string
	// APIInternalToken, if set, is sent as the X-Internal-Token header.
	APIInternalToken string
}

func LoadConfig() Config {
	return Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://pricedrop:pricedrop@localhost:5432/pricedrop?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/1"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		Port:        getEnv("PORT", "8001"),
		ScrapeInterval:    getEnvDuration("SCRAPE_INTERVAL", 6*time.Hour),
		CrawlInterval:     getEnvDuration("CRAWL_INTERVAL", 24*time.Hour),
		RequestDelay:       time.Duration(getEnvInt("REQUEST_DELAY_MS", 2000)) * time.Millisecond,
		MoreleSearchDelay:  time.Duration(getEnvInt("MORELE_SEARCH_DELAY_MS", 0)) * time.Millisecond,
		AmazonSearchDelay:  time.Duration(getEnvInt("AMAZON_SEARCH_DELAY_MS", 0)) * time.Millisecond,
		UserAgent:          getEnv("USER_AGENT", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
		APIInternalURL:     getEnv("API_INTERNAL_URL", "http://api:8000"),
		APIInternalToken:   getEnv("INTERNAL_API_TOKEN", ""),
	}
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
