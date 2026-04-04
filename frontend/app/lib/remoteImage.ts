/**
 * Hostnames allowed in next.config `images.remotePatterns`.
 * Other HTTPS URLs use `unoptimized` so arbitrary retailer CDNs still render.
 */
export function remoteImageOptions(src: string): { unoptimized?: true } {
  if (!src) return { unoptimized: true };
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return { unoptimized: true };
    const h = u.hostname.toLowerCase();
    if (
      h === "assets.isthereanydeal.com" ||
      h === "isthereanydeal.com" ||
      h.endsWith(".isthereanydeal.com") ||
      h === "cdn.cloudflare.steamstatic.com" ||
      h === "upload.wikimedia.org" ||
      h === "a.allegroimg.com" ||
      h === "www.amazon.pl"
    ) {
      return {};
    }
    return { unoptimized: true };
  } catch {
    return { unoptimized: true };
  }
}
