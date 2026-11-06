import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { revalidateTag } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-comments-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
  const { resetCommentRateLimit } = await import("@/lib/comments/anti-spam");
  resetCommentRateLimit();
  vi.mocked(revalidateTag).mockClear();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function publishedArticle(slug = "comment-target") {
  const { createArticle, publishArticle } = await import("@/lib/services/articles");
  const article = createArticle(articleInput({ slug }));
  publishArticle(article.id);
  return article;
}

function submission(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
    body: JSON.stringify({ locale: "zh", startedAt: Date.now() - 10_000, website: "", ...body }),
  });
}

describe("comments service", () => {
  it("holds new comments for review and only lists approved ones publicly", async () => {
    const { createComment, listApprovedComments, listStudioComments, setCommentStatus, countCommentsByStatus } = await import("@/lib/services/comments");
    const article = await publishedArticle();

    const { id } = createComment({ articleId: article.id, body: "  有一点不同意  ", locale: "zh", authorName: "", email: "" });
    expect(listApprovedComments(article.id)).toEqual([]);

    const [pending] = listStudioComments("pending");
    expect(pending).toMatchObject({ id, body: "有一点不同意", authorName: null, email: null, articleTitle: article.titleZh });

    setCommentStatus(id, "approved");
    expect(listApprovedComments(article.id)).toEqual([expect.objectContaining({ id, authorName: null, body: "有一点不同意" })]);
    expect(countCommentsByStatus()).toEqual({ pending: 0, approved: 1, rejected: 0 });

    setCommentStatus(id, "rejected");
    expect(listApprovedComments(article.id)).toEqual([]);
  });

  it("never exposes the commenter's email publicly", async () => {
    const { createComment, listApprovedComments, setCommentStatus } = await import("@/lib/services/comments");
    const article = await publishedArticle();
    const { id } = createComment({ articleId: article.id, body: "hi", locale: "en", email: "reader@example.com" });
    setCommentStatus(id, "approved");
    expect(JSON.stringify(listApprovedComments(article.id))).not.toContain("reader@example.com");
  });

  it("rejects comments on unpublished articles", async () => {
    const { createArticle } = await import("@/lib/services/articles");
    const { createComment } = await import("@/lib/services/comments");
    const draft = createArticle(articleInput({ slug: "draft-only" }));
    expect(() => createComment({ articleId: draft.id, body: "hi", locale: "zh" })).toThrow("Article not found.");
  });

  it("stores no network identifiers", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const columns = (getDb().pragma("table_info(comments)") as Array<{ name: string }>).map((column) => column.name);
    expect(columns.some((name) => /ip|agent/i.test(name))).toBe(false);
  });
});

describe("public comment endpoint", () => {
  it("accepts a valid anonymous comment as pending", async () => {
    const { POST } = await import("@/app/api/comments/route");
    const { listStudioComments } = await import("@/lib/services/comments");
    const article = await publishedArticle();

    const response = await POST(submission({ articleId: article.id, body: "写得好" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(listStudioComments("pending")).toHaveLength(1);
  });

  it("silently drops honeypot and too-fast submissions", async () => {
    const { POST } = await import("@/app/api/comments/route");
    const { listStudioComments } = await import("@/lib/services/comments");
    const article = await publishedArticle();

    expect((await POST(submission({ articleId: article.id, body: "spam", website: "http://spam.example" }))).status).toBe(202);
    expect((await POST(submission({ articleId: article.id, body: "spam", startedAt: Date.now() }))).status).toBe(202);
    expect(listStudioComments("pending")).toHaveLength(0);
  });

  it("rate limits a single client", async () => {
    const { POST } = await import("@/app/api/comments/route");
    const article = await publishedArticle();
    for (let index = 0; index < 5; index += 1) {
      expect((await POST(submission({ articleId: article.id, body: `第 ${index} 条` }))).status).toBe(202);
    }
    expect((await POST(submission({ articleId: article.id, body: "第六条" }))).status).toBe(429);
    expect((await POST(submission({ articleId: article.id, body: "别人" }, { "x-real-ip": "198.51.100.1" }))).status).toBe(202);
  });

  it("ignores forgeable address headers when rate limiting", async () => {
    const { POST } = await import("@/app/api/comments/route");
    const article = await publishedArticle();
    for (let index = 0; index < 6; index += 1) {
      const response = await POST(
        submission(
          { articleId: article.id, body: `轮换 ${index}` },
          { "cf-connecting-ip": `192.0.2.${index}`, "x-forwarded-for": `198.51.100.${index}` },
        ),
      );
      expect(response.status).toBe(index < 5 ? 202 : 429);
    }
  });

  it("reports an invalid email and empty bodies", async () => {
    const { POST } = await import("@/app/api/comments/route");
    const article = await publishedArticle();
    const badEmail = await POST(submission({ articleId: article.id, body: "hi", email: "not-an-email" }));
    expect(badEmail.status).toBe(400);
    expect(await badEmail.json()).toEqual({ error: "invalid_email" });
    expect((await POST(submission({ articleId: article.id, body: "   " }))).status).toBe(400);
  });

  it("requires a Turnstile token when Turnstile is configured", async () => {
    process.env.TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    try {
      const { POST } = await import("@/app/api/comments/route");
      const article = await publishedArticle();
      expect((await POST(submission({ articleId: article.id, body: "hi" }))).status).toBe(403);
      expect((await POST(submission({ articleId: article.id, body: "hi", turnstileToken: "tok" }))).status).toBe(403);
      const sent = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
      expect(sent.get("remoteip")).toBeNull();

      fetchMock.mockResolvedValue(Response.json({ success: true }));
      expect((await POST(submission({ articleId: article.id, body: "hi", turnstileToken: "tok" }))).status).toBe(202);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("studio comment moderation API", () => {
  async function adminRequest(method: string, body?: unknown, { csrf = "csrf-token" } = {}) {
    const { createSessionRecord } = await import("@/lib/auth/session");
    const { sessionCookie, csrfCookie } = await import("@/lib/auth/constants");
    const token = createSessionRecord().token;
    return new Request("http://localhost/studio/api/comments/1", {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie: `${sessionCookie}=${token}; ${csrfCookie}=csrf-token`,
        "x-csrf-token": csrf,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("rejects unauthenticated moderation", async () => {
    const { PATCH } = await import("@/app/studio/api/comments/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/studio/api/comments/1", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(response.status).toBe(401);
  });

  it("approves and deletes a comment and invalidates the article's comment cache", async () => {
    const { PATCH, DELETE } = await import("@/app/studio/api/comments/[id]/route");
    const { createComment, listApprovedComments } = await import("@/lib/services/comments");
    const article = await publishedArticle();
    const { id } = createComment({ articleId: article.id, body: "ok", locale: "zh" });
    const params = { params: Promise.resolve({ id: String(id) }) };

    const approve = await PATCH(await adminRequest("PATCH", { status: "approved" }), params);
    expect(approve.status).toBe(200);
    expect(listApprovedComments(article.id)).toHaveLength(1);
    expect(revalidateTag).toHaveBeenCalledWith(`public:comments:article:${article.id}`, { expire: 0 });

    const forged = await PATCH(await adminRequest("PATCH", { status: "rejected" }, { csrf: "wrong" }), params);
    expect(forged.status).toBe(403);

    expect((await DELETE(await adminRequest("DELETE"), params)).status).toBe(200);
    expect(listApprovedComments(article.id)).toHaveLength(0);
    expect((await DELETE(await adminRequest("DELETE"), params)).status).toBe(404);
  });
});
