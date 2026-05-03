import crypto from "node:crypto";

const params = { N: 16384, r: 8, p: 1, keylen: 64 };

function derive(password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = await derive(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p });
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = await derive(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
