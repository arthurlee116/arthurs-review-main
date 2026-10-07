import fs from "node:fs";
import { isIP } from "node:net";
import { Reader, type CountryResponse } from "maxmind";
import { getGeoIpPath } from "@/lib/env";
import { isLocale, type Locale } from "./locale";

export function countryLocale(country?: string | null): Locale {
  return country && ["CN", "HK", "MO", "TW"].includes(country.toUpperCase()) ? "zh" : "en";
}
export function preferredLocale(cookie: unknown, country?: string | null): Locale {
  return isLocale(cookie) ? cookie : countryLocale(country);
}
export function normalizeIp(ip: string | null) {
  if (!ip) return null;
  const normalized = ip.trim().replace(/^::ffff:/i, "");
  return isIP(normalized) ? normalized : null;
}
let cached: { path: string; signature: string; reader: Reader<CountryResponse> } | undefined;
export function lookupCountry(rawIp: string | null): string | null {
  const ip = normalizeIp(rawIp);
  if (!ip) return null;
  const path = getGeoIpPath();
  try {
    const stat = fs.statSync(path);
    const signature = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (cached?.path !== path || cached.signature !== signature) {
      const reader = new Reader<CountryResponse>(fs.readFileSync(path));
      cached = { path, signature, reader };
    }
  } catch {
    // A failed update never discards the last valid reader for this path.
    if (cached?.path !== path) return null;
  }
  try { return cached?.reader.get(ip)?.country?.iso_code ?? null; } catch { return null; }
}
