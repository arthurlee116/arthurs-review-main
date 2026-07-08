import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiError } from "@/app/studio/api/_helpers";

describe("studio API contracts", () => {
  it("rejects unauthenticated article creation", async () => {
    const mod = await import("@/app/studio/api/articles/route");
    const response = await mod.POST(new Request("http://localhost/studio/api/articles", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated single article translation", async () => {
    const mod = await import("@/app/studio/api/translations/article/route");
    const response = await mod.POST(new Request("http://localhost/studio/api/translations/article", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated batch translation", async () => {
    const mod = await import("@/app/studio/api/translations/published-missing/route");
    const response = await mod.POST(new Request("http://localhost/studio/api/translations/published-missing", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
  });

  it("returns the first invalid article field", async () => {
    const response = apiError(new z.ZodError([{ code: "custom", path: ["slug"], message: "Slug is bad", input: "" }]));

    await expect(response.json()).resolves.toEqual({ error: "Invalid request body: slug: Slug is bad" });
  });
});
