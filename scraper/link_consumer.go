package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// linkTargets is the set of target stores the consumer fans a product.created event out to.
// Order matters only for log readability; each target is checked independently.
var linkTargets = []string{"morele", "mediaexpert", "amazon"}

// LinkConsumer runs in a background goroutine, drains product.created events, and
// runs per-product linking against every target store the product is not yet linked to.
type LinkConsumer struct {
	app           *App
	amqpURL       string
	defaultDelay  time.Duration
	moreleMinScore float64
	meMinScore     float64
	amazonMinScore float64
	maxSearchHits  int
}

func NewLinkConsumer(app *App) *LinkConsumer {
	return &LinkConsumer{
		app:            app,
		amqpURL:        app.config.RabbitMQURL,
		defaultDelay:   5 * time.Second,
		moreleMinScore: 0.45,
		meMinScore:     0.45,
		amazonMinScore: 0.50,
		maxSearchHits:  25,
	}
}

// Run consumes product.created events until ctx is cancelled. On any AMQP error it
// reconnects after defaultDelay — matching the retry style used in notifications/main.py.
func (c *LinkConsumer) Run(ctx context.Context) {
	for {
		if err := ctx.Err(); err != nil {
			return
		}
		if err := c.consumeOnce(ctx); err != nil {
			log.Printf("[link/consumer] connection error: %v — retrying in %s", err, c.defaultDelay)
			select {
			case <-ctx.Done():
				return
			case <-time.After(c.defaultDelay):
			}
		}
	}
}

func (c *LinkConsumer) consumeOnce(ctx context.Context) error {
	conn, err := amqp.Dial(c.amqpURL)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("channel: %w", err)
	}
	defer ch.Close()

	if err := ch.ExchangeDeclare(exchangeName, exchangeKind, true, false, false, false, nil); err != nil {
		return fmt.Errorf("exchange declare: %w", err)
	}

	q, err := ch.QueueDeclare(productCreatedQueueName, true, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("queue declare: %w", err)
	}

	if err := ch.QueueBind(q.Name, productCreatedRoutingKey, exchangeName, false, nil); err != nil {
		return fmt.Errorf("queue bind: %w", err)
	}

	// prefetch=1 keeps the consumer from hammering target-store searches in parallel.
	// Linking one product sequentially against 3 targets is slow enough on its own.
	if err := ch.Qos(1, 0, false); err != nil {
		return fmt.Errorf("qos: %w", err)
	}

	deliveries, err := ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("consume: %w", err)
	}

	log.Printf("[link/consumer] connected: queue=%s key=%s", q.Name, productCreatedRoutingKey)

	for {
		select {
		case <-ctx.Done():
			return nil
		case d, ok := <-deliveries:
			if !ok {
				return errors.New("delivery channel closed")
			}
			c.handleDelivery(ctx, d)
		}
	}
}

func (c *LinkConsumer) handleDelivery(ctx context.Context, d amqp.Delivery) {
	var ev ProductCreatedEvent
	if err := json.Unmarshal(d.Body, &ev); err != nil {
		log.Printf("[link/consumer] bad payload, dropping: %v (%s)", err, truncateForLog(d.Body, 200))
		_ = d.Ack(false)
		return
	}
	if ev.ProductID <= 0 {
		log.Printf("[link/consumer] invalid product_id=%d, dropping", ev.ProductID)
		_ = d.Ack(false)
		return
	}

	c.processEvent(ctx, ev)
	_ = d.Ack(false)
}

func (c *LinkConsumer) processEvent(ctx context.Context, ev ProductCreatedEvent) {
	info, err := c.app.db.GetProductForLinkingByID(ev.ProductID, ev.SourceSlug)
	if err != nil {
		log.Printf("[link/consumer] product %d: load: %v", ev.ProductID, err)
		return
	}
	if info == nil {
		log.Printf("[link/consumer] product %d: no source price row — skip", ev.ProductID)
		return
	}

	pr := ProductToLink{
		ID:               info.ID,
		Title:            info.Title,
		ManufacturerCode: info.ManufacturerCode,
		SourceURL:        info.SourceURL,
		SourcePrice:      info.SourcePrice,
	}
	sourceSlug := strings.TrimSpace(ev.SourceSlug)
	if sourceSlug == "" {
		sourceSlug = info.SourceSlug
	}

	for _, target := range linkTargets {
		if err := ctx.Err(); err != nil {
			return
		}
		if target == sourceSlug {
			continue
		}
		already, err := c.app.db.ProductHasPriceForStore(pr.ID, target)
		if err != nil {
			log.Printf("[link/consumer] product %d: %s existence: %v", pr.ID, target, err)
			continue
		}
		if already {
			continue
		}
		c.linkOne(pr, sourceSlug, target)
	}
}

func (c *LinkConsumer) linkOne(pr ProductToLink, sourceSlug, target string) {
	sum := &LinkSummary{}
	defer func() {
		log.Printf("[link/consumer] product %d → %s: %+v", pr.ID, target, *sum)
	}()

	switch target {
	case "morele":
		store, err := c.app.db.GetStoreBySlug("morele")
		if err != nil {
			log.Printf("[link/consumer] morele store lookup: %v", err)
			sum.Errors++
			return
		}
		scraper, err := c.app.registry.Get("morele")
		if err != nil {
			log.Printf("[link/consumer] morele scraper: %v", err)
			sum.Errors++
			return
		}
		c.app.linkOneMorele(pr, sourceSlug, store.ID, scraper, c.app.config.MoreleSearchDelay, c.moreleMinScore, c.maxSearchHits, false, sum)

	case "mediaexpert":
		slug, store, err := mediaExpertTargetStoreSlugInDB(c.app)
		if err != nil {
			log.Printf("[link/consumer] mediaexpert store lookup: %v", err)
			sum.Errors++
			return
		}
		_ = slug
		scraper, err := c.app.registry.Get("mediaexpert")
		if err != nil {
			log.Printf("[link/consumer] mediaexpert scraper: %v", err)
			sum.Errors++
			return
		}
		me, ok := scraper.(*MediaExpertScraper)
		if !ok {
			log.Printf("[link/consumer] mediaexpert scraper wrong type")
			sum.Errors++
			return
		}
		c.app.linkOneMediaExpert(pr, sourceSlug, store.ID, me, c.meMinScore, c.maxSearchHits, false, sum)

	case "amazon":
		_, store, err := amazonTargetStoreSlugInDB(c.app)
		if err != nil {
			log.Printf("[link/consumer] amazon store lookup: %v", err)
			sum.Errors++
			return
		}
		scraper, err := c.app.registry.Get("amazon")
		if err != nil {
			log.Printf("[link/consumer] amazon scraper: %v", err)
			sum.Errors++
			return
		}
		c.app.linkOneAmazon(pr, sourceSlug, store.ID, scraper, c.app.config.AmazonSearchDelay, c.amazonMinScore, c.maxSearchHits, false, sum)

	default:
		log.Printf("[link/consumer] unknown target %q", target)
	}
}

func truncateForLog(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
