import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Reader, type CountryResponse } from "maxmind";
import { getGeoIpPath } from "@/lib/env";

type Download = (url: string) => Promise<Response>;
export async function updateGeoIp({ destination = getGeoIpPath(), now = new Date(), download = (url) => fetch(url, { signal: AbortSignal.timeout(60_000) }) }: { destination?: string; now?: Date; download?: Download } = {}) {
  const month = now.toISOString().slice(0, 7);
  const versionFile = `${destination}.month`;
  try {
    if ((await fs.readFile(versionFile, "utf8")).trim() === month) {
      new Reader<CountryResponse>(await fs.readFile(destination));
      return "current";
    }
  } catch { /* Fetch a missing or invalid database even when its version stamp exists. */ }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`;
    const [dataResponse, hashResponse] = await Promise.all([download(url), download("https://db-ip.com/db/download/ip-to-country-lite")]);
    if (!dataResponse.ok || !hashResponse.ok) throw new Error("GeoIP download failed");
    const compressed = Buffer.from(await dataResponse.arrayBuffer());
    const published = (await hashResponse.text()).match(/<dd>MMDB<\/dd>([\s\S]*?)<\/dl>[\s\S]*?href=['"]([^'"]+)/i);
    const expected = published?.[1].match(/<dt>SHA1SUM<\/dt>\s*<dd[^>]*>([a-f0-9]{40})<\/dd>/i)?.[1];
    if (published?.[2] !== url || !expected) throw new Error("Missing official GeoIP checksum for this month");
    const bytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
    if (createHash("sha1").update(bytes).digest("hex") !== expected.toLowerCase()) throw new Error("GeoIP checksum mismatch");
    const reader = new Reader<CountryResponse>(bytes);
    if (!reader.metadata.databaseType.toLowerCase().includes("country") || !reader.get("8.8.8.8")?.country?.iso_code) throw new Error("Invalid GeoIP country database");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(temporary, bytes, { mode: 0o644, flag: "wx" });
    await fs.rename(temporary, destination);
    await fs.writeFile(versionFile, month, { mode: 0o644 });
    return "updated";
  } catch (error) {
    // The destination is replaced only after validation. Allow deploys with a usable prior database.
    try {
      new Reader<CountryResponse>(await fs.readFile(destination));
      console.warn("GeoIP update failed; retaining the previous database", error instanceof Error ? error.message : "Unknown error");
      return "retained";
    } catch { throw error; }
  } finally { await fs.rm(temporary, { force: true }); }
}
