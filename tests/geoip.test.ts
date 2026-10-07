import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("maxmind", () => ({
  Reader: class {
    metadata = { databaseType: "Country" };
    records: Record<string, string>;
    constructor(bytes: Buffer) { this.records = JSON.parse(bytes.toString()); }
    get(ip: string) {
      if (ip === "9.9.9.9") throw new Error("lookup failed");
      return this.records[ip] ? { country: { iso_code: this.records[ip] } } : null;
    }
  },
}));
let dir: string;
let destination: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-geo-"));
  destination = path.join(dir, "country.mmdb");
  vi.stubEnv("GEOIP_DATABASE_PATH", destination);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe("local country lookup", () => {
  it.each(["CN", "HK", "MO", "TW", "cn"])("%s selects Chinese", async (country) => {
    const { countryLocale } = await import("@/lib/i18n/geoip");
    expect(countryLocale(country)).toBe("zh");
  });
  it("defaults to English and gives a manual preference priority", async () => {
    const { countryLocale, preferredLocale } = await import("@/lib/i18n/geoip");
    for (const country of ["US", "ES", undefined, null, ""]) expect(countryLocale(country)).toBe("en");
    expect(preferredLocale("en", "CN")).toBe("en");
    expect(preferredLocale("zh", "US")).toBe("zh");
    expect(preferredLocale("invalid", "TW")).toBe("zh");
  });
  it("queries IPv4, IPv6 and mapped IPv4; rejects untrusted malformed IPs", async () => {
    const { normalizeIp, lookupCountry } = await import("@/lib/i18n/geoip");
    fs.writeFileSync(destination, JSON.stringify({ "1.1.1.1": "HK", "2001:db8::1": "CN" }));
    expect(lookupCountry("1.1.1.1")).toBe("HK");
    expect(lookupCountry("2001:db8::1")).toBe("CN");
    expect(lookupCountry("::ffff:1.1.1.1")).toBe("HK");
    for (const ip of [null, "bad", "1.1.1.1, 8.8.8.8", "1.1.1.1:443"]) expect(normalizeIp(ip)).toBeNull();
    expect(lookupCountry("9.9.9.9")).toBeNull();
  });
  it("reloads atomic replacements and retains the valid reader after invalid replacements", async () => {
    const { lookupCountry } = await import("@/lib/i18n/geoip");
    expect(lookupCountry("1.1.1.1")).toBeNull();
    fs.writeFileSync(destination, '{"1.1.1.1":"US"}');
    expect(lookupCountry("1.1.1.1")).toBe("US");
    fs.writeFileSync(destination + ".new", '{"1.1.1.1":"CN"}');
    fs.renameSync(destination + ".new", destination);
    expect(lookupCountry("1.1.1.1")).toBe("CN");
    fs.writeFileSync(destination, "invalid");
    expect(lookupCountry("1.1.1.1")).toBe("CN");
    fs.unlinkSync(destination);
    expect(lookupCountry("1.1.1.1")).toBe("CN");
  });
});

describe("monthly database maintenance", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  function downloads(bytes: Buffer, hash = createHash("sha1").update(bytes).digest("hex")) {
    const url = "https://download.db-ip.com/free/dbip-country-lite-2026-10.mmdb.gz";
    return vi.fn(async (requested: string) => new Response(requested === url ? gzipSync(bytes) : `<dd>MMDB</dd><dt>SHA1SUM</dt><dd class="small">${hash}</dd></dl><a href='${url}'>Download</a>`));
  }
  it("validates the official checksum and atomically replaces the database", async () => {
    const { updateGeoIp } = await import("@/lib/i18n/update-geoip");
    fs.writeFileSync(destination, '{"8.8.8.8":"US"}');
    const bytes = Buffer.from('{"8.8.8.8":"US","1.1.1.1":"CN"}');
    const download = downloads(bytes);
    expect(await updateGeoIp({ destination, now, download })).toBe("updated");
    expect(fs.readFileSync(destination)).toEqual(bytes);
    expect(fs.readdirSync(dir).sort()).toEqual(["country.mmdb", "country.mmdb.month"]);
    download.mockClear();
    expect(await updateGeoIp({ destination, now, download })).toBe("current");
    expect(download).not.toHaveBeenCalled();
  });
  it("preserves old bytes and retries later on download, checksum and validation failure", async () => {
    const { updateGeoIp } = await import("@/lib/i18n/update-geoip");
    const old = '{"8.8.8.8":"US"}';
    fs.writeFileSync(destination, old);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const download of [async () => new Response("", { status: 503 }), downloads(Buffer.from(old), "0".repeat(40)), downloads(Buffer.from("invalid"))]) {
      expect(await updateGeoIp({ destination, now, download })).toBe("retained");
      expect(fs.readFileSync(destination, "utf8")).toBe(old);
      expect(fs.readdirSync(dir)).toEqual(["country.mmdb"]);
    }
    vi.restoreAllMocks();
  });
  it("fails first-time setup when no usable database exists", async () => {
    const { updateGeoIp } = await import("@/lib/i18n/update-geoip");
    await expect(updateGeoIp({ destination, now, download: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
    expect(fs.existsSync(destination)).toBe(false);
  });
});
