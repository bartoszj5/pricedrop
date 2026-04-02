package main

import (
	"database/sql"
	"time"
)

type Product struct {
	ID          int
	Title       string
	Slug        string
	Category    string
	Description sql.NullString
	ImageURL    sql.NullString
	ReleaseDate sql.NullTime
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Store struct {
	ID        int
	Name      string
	Slug      string
	URL       string
	LogoURL   sql.NullString
	IsActive  bool
	CreatedAt time.Time
}

type Price struct {
	ID            int
	ProductID     int
	StoreID       int
	CurrentPrice  float64
	Currency      string
	URL           string
	IsAvailable   bool
	LastCheckedAt sql.NullTime
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// PriceWithContext is returned by DB queries joining prices with store/product info.
type PriceWithContext struct {
	Price
	StoreSlug    string
	StoreName    string
	ProductTitle string
	ProductSlug  string
}

// ScrapeResult holds the data extracted from a store page.
type ScrapeResult struct {
	ProductName string
	Price       float64
	Currency    string
	IsAvailable bool
	ImageURL    string
}
