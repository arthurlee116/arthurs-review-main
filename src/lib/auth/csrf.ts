import crypto from "node:crypto";

export function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function verifyCsrfToken(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
