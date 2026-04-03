export function formatPrice(price: number, currency = "PLN"): string {
  return price.toLocaleString("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} dni temu`;
  return formatDate(iso);
}

export function getDomainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
