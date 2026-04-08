package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	exchangeName = "price_events"
	exchangeKind = "topic"
)

// PriceDroppedEvent is the payload published to RabbitMQ when a price drops.
type PriceDroppedEvent struct {
	ProductID    int     `json:"product_id"`
	ProductTitle string  `json:"product_title"`
	Store        string  `json:"store"`
	OldPrice     float64 `json:"old_price"`
	NewPrice     float64 `json:"new_price"`
	URL          string  `json:"url"`
}

// Publisher sends messages to RabbitMQ.
type Publisher struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

// NewPublisher connects to RabbitMQ and declares the exchange.
func NewPublisher(url string) (*Publisher, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	err = ch.ExchangeDeclare(
		exchangeName,
		exchangeKind,
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, err
	}

	return &Publisher{conn: conn, ch: ch}, nil
}

// PublishPriceDropped publishes a price.dropped event.
func (p *Publisher) PublishPriceDropped(event PriceDroppedEvent) {
	body, err := json.Marshal(event)
	if err != nil {
		log.Printf("[rabbitmq] failed to marshal event: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = p.ch.PublishWithContext(ctx,
		exchangeName,
		"price.dropped",
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		log.Printf("[rabbitmq] failed to publish price.dropped: %v", err)
	}
}

// Close tears down the channel and connection.
func (p *Publisher) Close() {
	if p.ch != nil {
		p.ch.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}
