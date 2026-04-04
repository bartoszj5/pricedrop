import { expect, test } from "@playwright/test";

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8000";

test("home page hides ITAD game results", async ({
  page,
  request,
}) => {
  const response = await request.get(
    `${API_BASE_URL}/products/with-prices?search=baldur&page_size=24`,
  );
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    items: Array<{ title: string; category: string }>;
  };

  const hasGameLikeResult = payload.items.some((item) =>
    ["game", "package"].includes(item.category.toLowerCase()),
  );
  expect(hasGameLikeResult).toBeTruthy();

  await page.goto("/?search=baldur");
  await expect(page.getByText("Brak produktów dla tego zestawu filtrów")).toBeVisible();
  await expect(
    page.getByText("pełny katalog gier jest w zakładce Gry", { exact: false }),
  ).toBeVisible();
});

test("free offers remain visible on product detail", async ({ page }) => {
  await page.goto("/products/baldurs-gate-3-toolkit");

  const activeOffersSection = page
    .locator("section")
    .filter({ hasText: "Porównanie cen" })
    .first();
  const freeOfferCard = activeOffersSection
    .locator("article")
    .filter({ hasText: "0,00 zł" })
    .first();

  await expect(activeOffersSection).toContainText("Aktywne oferty");
  await expect(freeOfferCard).toBeVisible();
  await expect(page.getByText("Brak aktywnych ofert dla tego produktu")).toHaveCount(0);
});

test("store detail paginates large inventories", async ({ page }) => {
  await page.goto("/stores/x-kom");

  const inventorySection = page
    .locator("section")
    .filter({ hasText: "Widok oferty" })
    .first();
  const pageTwoLink = page.locator('a[href="/stores/x-kom?page=2"]').first();

  await expect(inventorySection.locator("article")).toHaveCount(24);
  await expect(pageTwoLink).toBeVisible();
  await pageTwoLink.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(inventorySection.locator("article")).toHaveCount(24);
});

test("games search updates URL without exposing import control", async ({
  page,
}) => {
  await page.goto("/search");

  const input = page.getByLabel("Szukaj gier po tytule");
  await input.fill("Baldur");
  await page.waitForTimeout(600);

  await expect(page).toHaveURL(/search=Baldur/);
  await expect(
    page.getByRole("button", { name: "Importuj z ITAD" }),
  ).toHaveCount(0);
});

test("mobile filter drawer closes after selecting a filter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Otwórz panel filtrów" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Obudowa" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/category=case/);
});

test("unknown products render the not-found view", async ({ page }) => {
  await page.goto("/products/does-not-exist");

  await expect(page.getByText("Nie znaleziono strony")).toBeVisible();
});
