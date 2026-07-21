import { createHmac } from "node:crypto";
import { getDb } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";

function ipHash(ip: string) {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(ip.trim().toLowerCase(), "utf8").digest("hex");
}

export function checkLoginRateLimit(
  ip: string,
  {
    max,
    windowMs,
    now = new Date(),
  }: {
    max: number;
    windowMs: number;
    now?: Date;
  },
) {
  const db = getDb();
  return db.transaction(() => {
    const timestamp = now.toISOString();
    const cutoff = new Date(now.getTime() - windowMs).toISOString();
    const hash = ipHash(ip);
    db.prepare("delete from login_attempts where attempted_at <= ?").run(cutoff);
    const current = db
      .prepare("select count(*) as count from login_attempts where ip_hash = ? and attempted_at > ?")
      .get(hash, cutoff) as { count: number };
    if (current.count >= max) return { allowed: false, remaining: 0 };
    db.prepare("insert into login_attempts(ip_hash, attempted_at) values (?, ?)").run(hash, timestamp);
    return { allowed: true, remaining: max - current.count - 1 };
  }).immediate();
}

export function resetLoginRateLimit(ip: string) {
  getDb().prepare("delete from login_attempts where ip_hash = ?").run(ipHash(ip));
}
