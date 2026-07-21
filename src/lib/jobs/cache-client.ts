export async function invalidateCacheThroughApp(tags: string[]) {
  const secret = process.env.WORKER_REVALIDATE_SECRET;
  if (!secret) throw new Error("WORKER_REVALIDATE_SECRET is not configured.");
  const baseUrl = (process.env.INTERNAL_APP_URL ?? "http://app:3000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/internal/revalidate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Internal cache revalidation returned HTTP ${response.status}.`);
}
