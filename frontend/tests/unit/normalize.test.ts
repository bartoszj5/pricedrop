import { describe, expect, it } from "vitest";
import {
  isCatalogVisibleProduct,
  isGameLikeCategory,
  isFreeGameProduct,
  isMainCatalogVisibleProduct,
  normalizePriceListResponse,
  normalizeProductDetailResponse,
  normalizeProductListResponse,
} from "../../app/lib/normalize";

describe("normalize transport responses", () => {
  it("parses decimal strings in product lists", () => {
    const response = normalizeProductListResponse({
      items: [
        {
          id: 1,
          title: "Free DLC",
          slug: "free-dlc",
          category: "dlc",
          manufacturer_code: null,
          description: null,
          image_url: null,
          release_date: null,
          created_at: "2026-04-04T10:00:00Z",
          updated_at: "2026-04-04T10:00:00Z",
          best_price: "0.00",
          best_price_currency: "PLN",
          best_store_name: "Steam",
          best_store_slug: "steam",
          best_store_logo_url: null,
          available_offers_count: 1,
          tracked_stores_count: 2,
        },
      ],
      categories: ["dlc"],
      total: 1,
      page: 1,
      page_size: 24,
      total_pages: 1,
    });

    expect(response.items[0]?.best_price).toBe(0);
  });

  it("marks free game-like products as hidden in catalog", () => {
    expect(
      isFreeGameProduct({
        category: "game",
        best_price: 0,
      }),
    ).toBe(true);

    expect(
      isFreeGameProduct({
        category: "package",
        best_price: 0,
      }),
    ).toBe(true);

    expect(
      isCatalogVisibleProduct({
        category: "game",
        best_price: 0,
      }),
    ).toBe(false);

    expect(
      isCatalogVisibleProduct({
        category: "game",
        best_price: 19.99,
      }),
    ).toBe(true);

    expect(isGameLikeCategory(" package ")).toBe(true);

    expect(
      isMainCatalogVisibleProduct({
        category: "game",
      }),
    ).toBe(false);

    expect(
      isMainCatalogVisibleProduct({
        category: "package",
      }),
    ).toBe(false);

    expect(
      isMainCatalogVisibleProduct({
        category: "laptop",
      }),
    ).toBe(true);
  });

  it("parses product detail prices and keeps inactive rows", () => {
    const response = normalizeProductDetailResponse({
      product: {
        id: 1,
        title: "Tracked Only",
        slug: "tracked-only",
        category: "game",
        manufacturer_code: null,
        description: null,
        image_url: null,
        release_date: null,
        created_at: "2026-04-04T10:00:00Z",
        updated_at: "2026-04-04T10:00:00Z",
      },
      store_prices: [
        {
          price_id: 10,
          store_id: 1,
          store_name: "Steam",
          store_slug: "steam",
          store_url: "https://store.steampowered.com",
          store_logo_url: null,
          current_price: "29.99",
          currency: "PLN",
          product_url: "https://example.com",
          is_available: false,
          last_checked_at: "2026-04-04T10:00:00Z",
        },
      ],
      active_offers_count: 0,
      tracked_stores_count: 1,
      inactive_offers_count: 1,
    });

    expect(response.store_prices[0]?.current_price).toBe(29.99);
    expect(response.inactive_offers_count).toBe(1);
  });

  it("parses price list totals and nullable prices", () => {
    const response = normalizePriceListResponse({
      items: [
        {
          id: 1,
          product_id: 1,
          store_id: 1,
          current_price: "0.00",
          currency: "PLN",
          url: "https://example.com",
          is_available: true,
          last_checked_at: "2026-04-04T10:00:00Z",
          created_at: "2026-04-04T10:00:00Z",
          updated_at: "2026-04-04T10:00:00Z",
          product_title: "Free DLC",
          product_slug: "free-dlc",
          store_slug: "steam",
          store_name: "Steam",
        },
      ],
      availability: "active",
      total: 1,
      all_total: 2,
      active_total: 1,
      inactive_total: 1,
      page: 1,
      page_size: 24,
      total_pages: 1,
    });

    expect(response.items[0]?.current_price).toBe(0);
    expect(response.active_total).toBe(1);
    expect(response.inactive_total).toBe(1);
  });
});
