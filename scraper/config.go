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
	// Scraper settings
	RequestDelay time.Duration
	UserAgent    string
}

func LoadConfig() Config {
	return Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://pricedrop:pricedrop@localhost:5432/pricedrop?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/1"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		Port:        getEnv("PORT", "8001"),
		RequestDelay: time.Duration(getEnvInt("REQUEST_DELAY_MS", 2000)) * time.Millisecond,
		UserAgent:    getEnv("USER_AGENT", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
	}
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
