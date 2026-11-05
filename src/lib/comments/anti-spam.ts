import { createHash } from "node:crypto";
import { getTurnstileConfig } from "@/lib/env";

/** A human needs at least this long to read the form and type something. */
export const MIN_FILL_MS = 3_000;
/** Forms older than this are stale (and their Turnstile token has expired anyway). */
export const MAX_FILL_MS = 24 * 60 * 60 * 1_000;

export const COMMENT_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1_000 };

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Rate-limit state lives only in process memory and only as a one-way hash, so
// commenting never writes an IP address to disk. A restart simply resets it.
const recentSubmissions = new Map<string, number[]>();

function clientKey(ip: string) {
  return createHash("sha256").update(`comments:${ip.trim().toLowerCase()}`).digest("base64url");
}

export function checkCommentRateLimit(ip: string, now = Date.now(), { max, windowMs } = COMMENT_RATE_LIMIT) {
  const cutoff = now - windowMs;
  // Sweep so the map cannot grow without bound under a flood of distinct addresses.
  for (const [key, stamps] of recentSubmissions) {
    const live = stamps.filter((stamp) => stamp > cutoff);
    if (live.length) recentSubmissions.set(key, live);
    else recentSubmissions.delete(key);
  }
  const key = clientKey(ip);
  const stamps = recentSubmissions.get(key) ?? [];
  if (stamps.length >= max) return false;
  recentSubmissions.set(key, [...stamps, now]);
  return true;
}

export function resetCommentRateLimit() {
  recentSubmissions.clear();
}

/** Honeypot + timing: bots fill every field and submit instantly. */
export function looksLikeBot({ honeypot, startedAt }: { honeypot: unknown; startedAt: unknown }, now = Date.now()) {
  if (typeof honeypot === "string" && honeypot.trim() !== "") return true;
  const started = Number(startedAt);
  if (!Number.isFinite(started)) return true;
  const elapsed = now - started;
  return elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS;
}

/**
 * Verifies a Turnstile token. When Turnstile is not configured (local dev, tests)
 * the check is skipped and the honeypot + rate limit + manual review still apply.
 * The visitor's IP is deliberately not forwarded to Cloudflare.
 */
export async function verifyTurnstile(token: unknown, fetchImpl: typeof fetch = fetch) {
  const config = getTurnstileConfig();
  if (!config) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: config.secretKey, response: token }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
