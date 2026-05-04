type Entry = { count: number; resetAt: number };

export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, Entry>();

  return {
    hit(key: string) {
      const now = Date.now();
      const current = hits.get(key);
      if (!current || current.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: max - 1 };
      }
      current.count += 1;
      return { allowed: current.count <= max, remaining: Math.max(0, max - current.count) };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
