# PriceDrop

Price comparison platform that tracks and compares product prices across major Polish online stores. PriceDrop continuously scrapes retailers, links the same product across stores via fuzzy matching, records full price history, and notifies users through email or Discord when a target price is hit.

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white" />
  <img alt="Go" src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-8-DC382D?logo=redis&logoColor=white" />
  <img alt="RabbitMQ" src="https://img.shields.io/badge/RabbitMQ-4.2-FF6600?logo=rabbitmq&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

---

## Table of Contents

- [Features](#features)
- [Supported Stores](#supported-stores)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Database Migrations](#database-migrations)

---

## Features

- **Multi-store price tracking** — one canonical product record links prices across several retailers.
- **Automated crawling** — scheduled discovery of new products from category listings, deduplicated via normalized slugs.
- **Fuzzy cross-store linking** — a scored matching pipeline maps an `x-kom` product to its counterpart on Morele, Media Expert or Amazon.pl, with configurable minimum score, dry-run and probe modes.
- **Full price history** — every observed price change is persisted to `price_history`, surfaced as an interactive chart in the UI.
- **Target-price alerts** — users set a price threshold; the Notifications service matches incoming price drop events against active alerts and delivers email and/or Discord notifications.
- **Likes / watchlist** — authenticated users can follow products they care about.
- **IsThereAnyDeal integration** — the API periodically syncs popular-game metadata from the ITAD API to enrich the catalog.
- **Auth with JWT cookies** — registration, login, session issuance, CSRF protection for state-changing requests.
- **Redis caching** — read endpoints are cached with TTL; the scraper invalidates cache via an internal token-protected endpoint after writes.
- **Rate limiting** — SlowAPI + Redis storage protects public endpoints.
- **Server-rendered frontend** — Next.js App Router with React Server Components, Tailwind 4 styling, Recharts-powered price history, dark mode.

## Supported Stores

- [x-kom](https://www.x-kom.pl)
- [Media Expert](https://www.mediaexpert.pl)
- [Morele.net](https://www.morele.net)
- [Amazon.pl](https://www.amazon.pl)

Each store has its own `StoreScraper` (product-page scraper) and optionally a `StoreCrawler` (category-listing discovery) implementation in `scraper/`.

## Tech Stack

| Layer | Technology |
|---|---|
| API | Python 3.12, FastAPI, SQLModel / SQLAlchemy, PyJWT, bcrypt, SlowAPI, Alembic |
| Scraper | Go 1.26, Colly v2, `lib/pq`, `amqp091-go` |
| Notifications | Python 3.12, FastAPI, `aio_pika`, `aiosmtplib`, `httpx` |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts, Vitest, Playwright |
| Data | PostgreSQL 17, Redis 8, RabbitMQ 4.2 |
| Infra | Docker Compose |

## Getting Started

### Prerequisites

- Docker & Docker Compose

### Run the full stack

```bash
git clone https://github.com/bartoszj5/pricedrop.git
cd pricedrop
cp .env.example .env          # fill in secrets — see Configuration below
docker compose up -d --build
```

Services:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Scraper | http://localhost:8001 |
| Notifications | http://localhost:8002 |
| RabbitMQ management | http://localhost:15672 |

First-run seed (optional): apply migrations, then trigger a crawl to populate the catalog:

```bash
docker compose exec api alembic upgrade head
curl -X POST http://localhost:8001/crawl \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN"
```

## Configuration

All configuration is environment-based. Copy `.env.example` to `.env` and set values as needed.

| Variable | Service | Description |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | postgres | DB credentials (default `pricedrop`). |
| `RABBITMQ_USER` / `RABBITMQ_PASS` | rabbitmq | Broker credentials. |
| `REDIS_PASSWORD` | redis | Optional; when set, Redis starts with `--requirepass`. |
| `SECRET_KEY` | api | **Required in production.** Signs JWT tokens. |
| `ENVIRONMENT` | api | `development` or `production`. |
| `CORS_ORIGINS` | api | Comma-separated origins allowed by CORS. |
| `COOKIE_SECURE` | api | Force `Secure` flag on auth cookie. |
| `INTERNAL_API_TOKEN` | api, scraper, frontend | Shared bearer token for internal endpoints (cache invalidation, scraper triggers). |
| `CACHE_DEFAULT_TTL_SECONDS` | api | Default Redis cache TTL (default `300`). |
| `ITAD_API_KEY` | api | IsThereAnyDeal API key; disables sync if empty. |
| `ITAD_SYNC_INTERVAL` / `ITAD_POPULAR_LIMIT` / `ITAD_SYNC_COUNTRY` | api | ITAD sync tuning. |
| `SCRAPE_INTERVAL` / `CRAWL_INTERVAL` | scraper | Scheduler cadence (e.g. `6h`, `24h`; `0` disables). |
| `API_INTERNAL_URL` | scraper | Base URL of the API (for cache invalidation). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` | notifications | Email delivery. Leave `SMTP_HOST` empty to disable email. |
| `SMTP_USE_TLS` / `SMTP_STARTTLS` | notifications | TLS mode. |
| `INTERNAL_API_URL` | frontend | Server-side API URL for RSC fetches. |

## Database Migrations

Alembic reads `DATABASE_URL` (defaults to `postgresql://pricedrop:pricedrop@localhost:5432/pricedrop`). Models live in `shared/models.py`.

```bash
alembic upgrade head                                # apply all migrations
alembic revision --autogenerate -m "description"    # create a new migration
alembic downgrade -1                                # revert one step
```