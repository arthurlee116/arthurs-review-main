import { describe, expect, it } from "vitest";

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
});
