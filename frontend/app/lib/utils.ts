export function formatPrice(price: number, currency = "PLN"): string {
  if (!Number.isFinite(price)) {
    return "Brak ceny";
  }

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "przed chwilą";

  const relativeTime = new Intl.RelativeTimeFormat("pl-PL", {
    numeric: "auto",
  });

  if (minutes < 60) return relativeTime.format(-minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 30) return relativeTime.format(-days, "day");

  return formatDate(iso);
}

export function getDomainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function isGenericStoreUrl(url: string): boolean {
  return getDomainLabel(url) === "isthereanydeal.com";
}

export function getStoreSourceLabel(url: string): string {
  return isGenericStoreUrl(url) ? "Źródło z ITAD" : getDomainLabel(url);
}

export function polishPlural(
  count: number,
  singular: string,
  paucal: string,
  plural: string,
): string {
  const absolute = Math.abs(count);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (absolute === 1) return singular;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return paucal;
  }
  return plural;
}

const categoryLabels: Record<string, string> = {
  case: "Obudowa",
  console: "Konsola",
  "console-handheld": "Konsola przenośna",
  "console-nintendo": "Nintendo",
  "console-xbox": "Xbox",
  cooling: "Chłodzenie",
  "cooling-aio": "Chłodzenie AIO",
  "cooling-air": "Chłodzenie powietrzem",
  cpu: "Procesor",
  desktop: "Komputer",
  "ebook-reader": "Czytnik e-book",
  dlc: "Dodatek",
  game: "Gra",
  "game-pc": "Gra PC",
  "game-ps5": "Gra PS5",
  "game-switch": "Gra Switch",
  "game-xbox": "Gra Xbox",
  gamepad: "Gamepad",
  "gaming-chair": "Fotel gamingowy",
  "gaming-headset": "Słuchawki gamingowe",
  "gaming-keyboard": "Klawiatura gamingowa",
  "gaming-monitor": "Monitor gamingowy",
  "gaming-mouse": "Mysz gamingowa",
  gpu: "Karta graficzna",
  "gpu-amd": "GPU AMD",
  "gpu-nvidia": "GPU NVIDIA",
  hdd: "Dysk HDD",
  headphones: "Słuchawki",
  laptop: "Laptop",
  monitor: "Monitor",
  motherboard: "Płyta główna",
  printer: "Drukarka",
  projector: "Projektor",
  psu: "Zasilacz",
  ram: "Pamięć RAM",
  router: "Router",
  smartphone: "Smartfon",
  smartwatch: "Smartwatch",
  soundbar: "Soundbar",
  ssd: "Dysk SSD",
  "steering-wheel": "Kierownica",
  tablet: "Tablet",
  tv: "Telewizor",
  vr: "Gogle VR",
};

export function humanizeCategory(slug: string): string {
  return categoryLabels[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
