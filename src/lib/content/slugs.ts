export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertValidSlug(slug: string) {
  if (!slugPattern.test(slug)) {
    throw new Error("Slug must use lowercase letters, numbers, and single hyphens.");
  }
}
