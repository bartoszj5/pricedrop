package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

type DB struct {
	conn *sql.DB
}

func NewDB(databaseURL string) (*DB, error) {
	// Ensure sslmode is set — Docker Postgres doesn't use SSL.
	if !strings.Contains(databaseURL, "sslmode=") {
		if strings.Contains(databaseURL, "?") {
			databaseURL += "&sslmode=disable"
		} else {
			databaseURL += "?sslmode=disable"
		}
	}

	conn, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}
	conn.SetMaxOpenConns(10)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(5 * time.Minute)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("pinging database: %w", err)
	}
	log.Println("Connected to database")
	return &DB{conn: conn}, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

// GetPricesForStore returns all price records for a given store slug.
func (db *DB) GetPricesForStore(storeSlug string) ([]PriceWithContext, error) {
	query := `
		SELECT
			p.id, p.product_id, p.store_id, p.current_price, p.currency,
			p.url, p.is_available, p.last_checked_at, p.created_at, p.updated_at,
			s.slug AS store_slug, s.name AS store_name,
			pr.title AS product_title, pr.slug AS product_slug
		FROM prices p
		JOIN stores s ON s.id = p.store_id
		JOIN products pr ON pr.id = p.product_id
		WHERE s.slug = $1 AND s.is_active = true
		ORDER BY p.id
	`
	rows, err := db.conn.Query(query, storeSlug)
	if err != nil {
		return nil, fmt.Errorf("querying prices for store %s: %w", storeSlug, err)
	}
	defer rows.Close()

	var prices []PriceWithContext
	for rows.Next() {
		var p PriceWithContext
		err := rows.Scan(
			&p.ID, &p.ProductID, &p.StoreID, &p.CurrentPrice, &p.Currency,
			&p.URL, &p.IsAvailable, &p.LastCheckedAt, &p.CreatedAt, &p.UpdatedAt,
			&p.StoreSlug, &p.StoreName,
			&p.ProductTitle, &p.ProductSlug,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning price row: %w", err)
		}
		prices = append(prices, p)
	}
	return prices, rows.Err()
}

// GetAllActivePrices returns all price records for active stores.
func (db *DB) GetAllActivePrices() ([]PriceWithContext, error) {
	query := `
		SELECT
			p.id, p.product_id, p.store_id, p.current_price, p.currency,
			p.url, p.is_available, p.last_checked_at, p.created_at, p.updated_at,
			s.slug AS store_slug, s.name AS store_name,
			pr.title AS product_title, pr.slug AS product_slug
		FROM prices p
		JOIN stores s ON s.id = p.store_id
		JOIN products pr ON pr.id = p.product_id
		WHERE s.is_active = true
		ORDER BY s.slug, p.id
	`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("querying all active prices: %w", err)
	}
	defer rows.Close()

	var prices []PriceWithContext
	for rows.Next() {
		var p PriceWithContext
		err := rows.Scan(
			&p.ID, &p.ProductID, &p.StoreID, &p.CurrentPrice, &p.Currency,
			&p.URL, &p.IsAvailable, &p.LastCheckedAt, &p.CreatedAt, &p.UpdatedAt,
			&p.StoreSlug, &p.StoreName,
			&p.ProductTitle, &p.ProductSlug,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning price row: %w", err)
		}
		prices = append(prices, p)
	}
	return prices, rows.Err()
}

// UpdatePrice updates the current price and availability, and inserts a price history
// record if the price changed. Returns true if the price was changed.
func (db *DB) UpdatePrice(priceID int, oldPrice, newPrice float64, currency string, isAvailable bool) (bool, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return false, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()

	// Update the price record.
	_, err = tx.Exec(`
		UPDATE prices
		SET current_price = $1, is_available = $2, last_checked_at = $3, updated_at = $3
		WHERE id = $4
	`, newPrice, isAvailable, now, priceID)
	if err != nil {
		return false, fmt.Errorf("updating price %d: %w", priceID, err)
	}

	priceChanged := oldPrice != newPrice

	// Insert price history if price changed.
	if priceChanged {
		_, err = tx.Exec(`
			INSERT INTO price_history (price_id, old_price, new_price, currency, recorded_at)
			VALUES ($1, $2, $3, $4, $5)
		`, priceID, oldPrice, newPrice, currency, now)
		if err != nil {
			return false, fmt.Errorf("inserting price history for %d: %w", priceID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("committing transaction: %w", err)
	}
	return priceChanged, nil
}

// MarkChecked updates last_checked_at without changing the price.
func (db *DB) MarkChecked(priceID int) error {
	now := time.Now().UTC()
	_, err := db.conn.Exec(`
		UPDATE prices SET last_checked_at = $1, updated_at = $1 WHERE id = $2
	`, now, priceID)
	return err
}

// ---------------------------------------------------------------------------
// Crawler helpers
// ---------------------------------------------------------------------------

// GetStoreBySlug returns a store record by its slug.
func (db *DB) GetStoreBySlug(slug string) (*Store, error) {
	var s Store
	err := db.conn.QueryRow(`
		SELECT id, name, slug, url, logo_url, is_active, created_at
		FROM stores WHERE slug = $1
	`, slug).Scan(&s.ID, &s.Name, &s.Slug, &s.URL, &s.LogoURL, &s.IsActive, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("getting store %s: %w", slug, err)
	}
	return &s, nil
}

// PriceExistsByURL checks whether a price record with the given product URL already exists.
func (db *DB) PriceExistsByURL(url string) (bool, error) {
	var exists bool
	err := db.conn.QueryRow(`SELECT EXISTS(SELECT 1 FROM prices WHERE url = $1)`, url).Scan(&exists)
	return exists, err
}

// UpsertProductAndPrice inserts a product (or finds an existing one by slug) and
// creates a price record linking it to the given store. If the price record
// already exists (product_id, store_id unique constraint), it is skipped.
func (db *DB) UpsertProductAndPrice(title, productSlug, category, imageURL string, storeID int, price float64, currency, url string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()

	// Upsert product — if slug already exists, keep existing data and update image if missing.
	var productID int
	err = tx.QueryRow(`
		INSERT INTO products (title, slug, category, image_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $5)
		ON CONFLICT (slug) DO UPDATE SET
			image_url = COALESCE(NULLIF(products.image_url, ''), EXCLUDED.image_url),
			updated_at = $5
		RETURNING id
	`, title, productSlug, category, imageURL, now).Scan(&productID)
	if err != nil {
		return fmt.Errorf("upserting product %s: %w", productSlug, err)
	}

	// Insert price — skip if this product+store pair already exists.
	_, err = tx.Exec(`
		INSERT INTO prices (product_id, store_id, current_price, currency, url, is_available, last_checked_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, true, $6, $6, $6)
		ON CONFLICT (product_id, store_id) DO NOTHING
	`, productID, storeID, price, currency, url, now)
	if err != nil {
		return fmt.Errorf("inserting price for product %d store %d: %w", productID, storeID, err)
	}

	return tx.Commit()
}
