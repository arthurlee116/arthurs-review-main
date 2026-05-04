export function absoluteUrl(path: string) {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
