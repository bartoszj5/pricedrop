import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatPrice,
  getStoreSourceLabel,
  humanizeCategory,
  isGenericStoreUrl,
  timeAgo,
} from "../../app/lib/utils";

describe("utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats prices with Polish currency output", () => {
    expect(formatPrice(0, "PLN")).toMatch(/^0,00\s*zł$/u);
    expect(formatPrice(16.99, "PLN")).toMatch(/^16,99\s*zł$/u);
  });

  it("renders Polish relative time correctly for singular days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));

    expect(timeAgo("2026-04-04T10:00:00Z")).toBe("wczoraj");
  });

  it("maps imported ITAD store URLs to a neutral source label", () => {
    expect(isGenericStoreUrl("https://isthereanydeal.com")).toBe(true);
    expect(getStoreSourceLabel("https://isthereanydeal.com")).toBe("Źródło z ITAD");
  });

  it("humanizes known category slugs", () => {
    expect(humanizeCategory("dlc")).toBe("Dodatek");
    expect(humanizeCategory("game-pc")).toBe("Gra PC");
  });
});
