package main

import (
	"database/sql"
	"fmt"
	"log"
	"math"
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

// AuditCandidate is one price row (one store's offer) participating in a title audit.
type AuditCandidate struct {
	PriceID      int
	StoreID      int
	StoreSlug    string
	StoreName    string
	StoreTitle   string
	URL          string
	CurrentPrice float64
}

// AuditGroup is all price rows for one product that have a store_title available
// for similarity comparison against the canonical product.title.
type AuditGroup struct {
	ProductID        int
	ProductTitle     string
	ProductCategory  string
	ManufacturerCode sql.NullString
	Candidates       []AuditCandidate
}

// GetPricesForAudit returns price rows with a non-empty store_title, grouped by product,
// for title-similarity auditing. Optional filters: storeSlug restricts to offers from
// one store; category restricts by product category. Groups with no candidates are omitted.
func (db *DB) GetPricesForAudit(storeSlug, category string) ([]AuditGroup, error) {
	args := []any{}
	where := []string{"s.is_active = true", "p.store_title IS NOT NULL", "TRIM(p.store_title) <> ''"}
	if strings.TrimSpace(storeSlug) != "" {
		args = append(args, storeSlug)
		where = append(where, fmt.Sprintf("s.slug = $%d", len(args)))
	}
	if strings.TrimSpace(category) != "" {
		args = append(args, category)
		where = append(where, fmt.Sprintf("pr.category = $%d", len(args)))
	}

	query := fmt.Sprintf(`
		SELECT
			pr.id, pr.title, pr.category, pr.manufacturer_code,
			p.id, p.store_id, s.slug, s.name, p.store_title, p.url, p.current_price
		FROM prices p
		JOIN stores s   ON s.id = p.store_id
		JOIN products pr ON pr.id = p.product_id
		WHERE %s
		ORDER BY pr.id, p.id
	`, strings.Join(where, " AND "))

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("querying audit rows: %w", err)
	}
	defer rows.Close()

	groups := make([]AuditGroup, 0)
	byProduct := make(map[int]int) // product_id -> index in groups

	for rows.Next() {
		var (
			productID       int
			productTitle    string
			productCategory string
			mfr             sql.NullString
			priceID         int
			storeID         int
			storeSlugOut    string
			storeName       string
			storeTitle      string
			url             string
			currentPrice    float64
		)
		if err := rows.Scan(
			&productID, &productTitle, &productCategory, &mfr,
			&priceID, &storeID, &storeSlugOut, &storeName, &storeTitle, &url, &currentPrice,
		); err != nil {
			return nil, fmt.Errorf("scanning audit row: %w", err)
		}

		idx, ok := byProduct[productID]
		if !ok {
			groups = append(groups, AuditGroup{
				ProductID:        productID,
				ProductTitle:     productTitle,
				ProductCategory:  productCategory,
				ManufacturerCode: mfr,
			})
			idx = len(groups) - 1
			byProduct[productID] = idx
		}
		groups[idx].Candidates = append(groups[idx].Candidates, AuditCandidate{
			PriceID:      priceID,
			StoreID:      storeID,
			StoreSlug:    storeSlugOut,
			StoreName:    storeName,
			StoreTitle:   storeTitle,
			URL:          url,
			CurrentPrice: currentPrice,
		})
	}
	return groups, rows.Err()
}

// UpdatePrice updates the current price and availability, and inserts a price history
// record if the price changed. Returns true if the price was changed.
// storeTitle is the product name as scraped from the store page; when empty, the existing
// store_title value is kept.
func (db *DB) UpdatePrice(priceID int, oldPrice, newPrice float64, currency string, isAvailable bool, storeTitle string) (bool, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return false, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()

	// Update the price record. COALESCE keeps the old store_title when the scrape
	// didn't return one (empty string → NULL via NULLIF), so we never erase it.
	_, err = tx.Exec(`
		UPDATE prices
		SET current_price = $1,
		    is_available = $2,
		    last_checked_at = $3,
		    updated_at = $3,
		    store_title = COALESCE(NULLIF($5, ''), store_title)
		WHERE id = $4
	`, newPrice, isAvailable, now, priceID, storeTitle)
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
// manufacturerCode: when non-empty, set on insert or overwrite on conflict when provided.
// storeTitle is the product name as scraped from the store page (may differ from the
// canonical product title); stored for later title-similarity audits.
// Returns the product ID and whether the price row was newly created (true on insert,
// false when ON CONFLICT DO NOTHING kicked in).
func (db *DB) UpsertProductAndPrice(title, productSlug, category, imageURL string, storeID int, price float64, currency, url, manufacturerCode, storeTitle string) (int, bool, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return 0, false, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()

	// Upsert product — if slug already exists, keep existing data and update image if missing.
	var productID int
	err = tx.QueryRow(`
		INSERT INTO products (title, slug, category, image_url, manufacturer_code, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NULLIF(TRIM($5), ''), $6, $6)
		ON CONFLICT (slug) DO UPDATE SET
			image_url = COALESCE(NULLIF(products.image_url, ''), EXCLUDED.image_url),
			manufacturer_code = COALESCE(NULLIF(TRIM(EXCLUDED.manufacturer_code), ''), NULLIF(products.manufacturer_code, '')),
			updated_at = $6
		RETURNING id
	`, title, productSlug, category, imageURL, manufacturerCode, now).Scan(&productID)
	if err != nil {
		return 0, false, fmt.Errorf("upserting product %s: %w", productSlug, err)
	}

	// Insert price — skip if this product+store pair already exists.
	res, err := tx.Exec(`
		INSERT INTO prices (product_id, store_id, current_price, currency, url, store_title, is_available, last_checked_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NULLIF(TRIM($7), ''), true, $6, $6, $6)
		ON CONFLICT (product_id, store_id) DO NOTHING
	`, productID, storeID, price, currency, url, now, storeTitle)
	if err != nil {
		return 0, false, fmt.Errorf("inserting price for product %d store %d: %w", productID, storeID, err)
	}
	rowsAffected, _ := res.RowsAffected()

	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return productID, rowsAffected > 0, nil
}

// ProductLinkInfo holds the data needed to run a per-product link job triggered by a
// product.created RabbitMQ event.
type ProductLinkInfo struct {
	ID               int
	Title            string
	ManufacturerCode string
	SourceSlug       string
	SourceURL        string
	SourcePrice      float64
}

// GetProductForLinkingByID fetches a product together with one of its existing source
// prices so the link consumer has enough context to score candidates. Returns
// (nil, nil) when the product has no price rows at all.
func (db *DB) GetProductForLinkingByID(productID int, preferredSourceSlug string) (*ProductLinkInfo, error) {
	const q = `
		SELECT pr.id, pr.title, COALESCE(pr.manufacturer_code, ''),
		       s.slug, COALESCE(px.url, ''), px.current_price
		FROM products pr
		INNER JOIN prices px ON px.product_id = pr.id
		INNER JOIN stores s  ON s.id = px.store_id AND s.is_active = true
		WHERE pr.id = $1
		ORDER BY CASE WHEN s.slug = $2 THEN 0 ELSE 1 END, px.updated_at DESC
		LIMIT 1
	`
	row := db.conn.QueryRow(q, productID, preferredSourceSlug)
	var info ProductLinkInfo
	err := row.Scan(&info.ID, &info.Title, &info.ManufacturerCode, &info.SourceSlug, &info.SourceURL, &info.SourcePrice)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("loading product %d for linking: %w", productID, err)
	}
	return &info, nil
}

// ProductHasPriceForStore reports whether productID already has a price row in the given store slug.
func (db *DB) ProductHasPriceForStore(productID int, storeSlug string) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1 FROM prices p
			INNER JOIN stores s ON s.id = p.store_id
			WHERE p.product_id = $1 AND s.slug = $2
		)
	`
	var exists bool
	if err := db.conn.QueryRow(q, productID, storeSlug).Scan(&exists); err != nil {
		return false, fmt.Errorf("checking price existence (product=%d store=%s): %w", productID, storeSlug, err)
	}
	return exists, nil
}

// SetProductManufacturerCode sets manufacturer_code when code is non-empty (overwrites existing).
func (db *DB) SetProductManufacturerCode(productID int, code string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil
	}
	if len(code) > 128 {
		code = code[:128]
	}
	now := time.Now().UTC()
	_, err := db.conn.Exec(`
		UPDATE products SET manufacturer_code = $1, updated_at = $2 WHERE id = $3
	`, code, now, productID)
	if err != nil {
		return fmt.Errorf("setting manufacturer_code for product %d: %w", productID, err)
	}
	return nil
}

// ProductIDURL is a product id with a store product page URL (e.g. x-kom offer).
type ProductIDURL struct {
	ID  int
	URL string
}

// ListProductsForXKOMManufacturerEnrich returns products that have an x-kom price row.
// If onlyMissing is true, rows with manufacturer_code already set are skipped.
// category filters by products.category when non-empty.
func (db *DB) ListProductsForXKOMManufacturerEnrich(onlyMissing bool, category string, limit int) ([]ProductIDURL, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > 5000 {
		limit = 5000
	}
	const q = `
		SELECT pr.id, px.url
		FROM products pr
		INNER JOIN prices px ON px.product_id = pr.id
		INNER JOIN stores s ON s.id = px.store_id AND s.slug = 'x-kom' AND s.is_active = true
		WHERE ($1::bool = false OR pr.manufacturer_code IS NULL OR btrim(pr.manufacturer_code) = '')
		AND ($2::text = '' OR pr.category = $2)
		ORDER BY pr.id
		LIMIT $3
	`
	rows, err := db.conn.Query(q, onlyMissing, category, limit)
	if err != nil {
		return nil, fmt.Errorf("listing x-kom products for manufacturer enrich: %w", err)
	}
	defer rows.Close()

	var out []ProductIDURL
	for rows.Next() {
		var r ProductIDURL
		if err := rows.Scan(&r.ID, &r.URL); err != nil {
			return nil, fmt.Errorf("scanning enrich row: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListProductsWithSourceWithoutTargetStore returns products that have at least one price
// from sourceStoreSlug (active store) and no price row for targetStoreSlug.
// If category is non-empty, only rows with products.category = category are returned
// (same values as crawler category keys, e.g. cpu, gpu).
// limit > 0 caps the result set; limit == 0 means no cap (all matching rows).
func (db *DB) ListProductsWithSourceWithoutTargetStore(sourceStoreSlug, targetStoreSlug, category string, limit int) ([]ProductToLink, error) {
	const qLimited = `
		SELECT pr.id, pr.title, COALESCE(pr.manufacturer_code, ''), COALESCE(px.url, ''), px.current_price
		FROM products pr
		INNER JOIN prices px ON px.product_id = pr.id
		INNER JOIN stores sx ON sx.id = px.store_id AND sx.slug = $1 AND sx.is_active = true
		WHERE ($4::text = '' OR pr.category = $4)
		AND NOT EXISTS (
			SELECT 1 FROM prices pt
			INNER JOIN stores st ON st.id = pt.store_id AND st.slug = $2
			WHERE pt.product_id = pr.id
		)
		ORDER BY pr.id
		LIMIT $3
	`
	const qAll = `
		SELECT pr.id, pr.title, COALESCE(pr.manufacturer_code, ''), COALESCE(px.url, ''), px.current_price
		FROM products pr
		INNER JOIN prices px ON px.product_id = pr.id
		INNER JOIN stores sx ON sx.id = px.store_id AND sx.slug = $1 AND sx.is_active = true
		WHERE ($3::text = '' OR pr.category = $3)
		AND NOT EXISTS (
			SELECT 1 FROM prices pt
			INNER JOIN stores st ON st.id = pt.store_id AND st.slug = $2
			WHERE pt.product_id = pr.id
		)
		ORDER BY pr.id
	`
	var rows *sql.Rows
	var err error
	if limit == 0 {
		rows, err = db.conn.Query(qAll, sourceStoreSlug, targetStoreSlug, category)
	} else {
		if limit < 0 {
			limit = 50
		}
		rows, err = db.conn.Query(qLimited, sourceStoreSlug, targetStoreSlug, limit, category)
	}
	if err != nil {
		return nil, fmt.Errorf("listing products to link (%s → %s): %w", sourceStoreSlug, targetStoreSlug, err)
	}
	defer rows.Close()

	var out []ProductToLink
	for rows.Next() {
		var p ProductToLink
		if err := rows.Scan(&p.ID, &p.Title, &p.ManufacturerCode, &p.SourceURL, &p.SourcePrice); err != nil {
			return nil, fmt.Errorf("scanning product row: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpsertPriceForProduct inserts or updates a price for an existing product and store.
// When the price value changes on update, a row is appended to price_history.
// storeTitle is the product name as scraped from the store page; when empty, the existing
// store_title value (if any) is kept on update.
func (db *DB) UpsertPriceForProduct(productID, storeID int, newPrice float64, currency, productURL string, isAvailable bool, storeTitle string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()
	newRounded := math.Round(newPrice*100) / 100

	var priceID int
	var oldPrice float64
	err = tx.QueryRow(`
		SELECT id, current_price FROM prices WHERE product_id = $1 AND store_id = $2
	`, productID, storeID).Scan(&priceID, &oldPrice)

	if err == sql.ErrNoRows {
		_, err = tx.Exec(`
			INSERT INTO prices (product_id, store_id, current_price, currency, url, store_title, is_available, last_checked_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, NULLIF(TRIM($8), ''), $6, $7, $7, $7)
		`, productID, storeID, newRounded, currency, productURL, isAvailable, now, storeTitle)
		if err != nil {
			return fmt.Errorf("inserting price for product %d store %d: %w", productID, storeID, err)
		}
		return tx.Commit()
	}
	if err != nil {
		return fmt.Errorf("selecting price for product %d store %d: %w", productID, storeID, err)
	}

	_, err = tx.Exec(`
		UPDATE prices
		SET current_price = $1,
		    currency = $2,
		    url = $3,
		    is_available = $4,
		    last_checked_at = $5,
		    updated_at = $5,
		    store_title = COALESCE(NULLIF(TRIM($7), ''), store_title)
		WHERE id = $6
	`, newRounded, currency, productURL, isAvailable, now, priceID, storeTitle)
	if err != nil {
		return fmt.Errorf("updating price %d: %w", priceID, err)
	}

	oldRounded := math.Round(oldPrice*100) / 100
	if oldRounded != newRounded {
		_, err = tx.Exec(`
			INSERT INTO price_history (price_id, old_price, new_price, currency, recorded_at)
			VALUES ($1, $2, $3, $4, $5)
		`, priceID, oldRounded, newRounded, currency, now)
		if err != nil {
			return fmt.Errorf("inserting price history for %d: %w", priceID, err)
		}
	}

	return tx.Commit()
}
