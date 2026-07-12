import { afterEach, describe, expect, it } from "vitest";
import { getDataPaths } from "@/lib/env";

const previousPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const previousSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (previousPasswordHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
  else process.env.ADMIN_PASSWORD_HASH = previousPasswordHash;
  if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSessionSecret;
});

describe("public data paths", () => {
  it("do not require private admin credentials during prerendering", () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.SESSION_SECRET;

    expect(getDataPaths().dbPath).toContain("arthurs-review.sqlite3");
  });
});
