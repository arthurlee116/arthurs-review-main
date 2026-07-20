import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-proofs-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  delete process.env.WAYBACK_ACCESS_KEY;
  delete process.env.WAYBACK_SECRET_KEY;
});

async function publishedArticle() {
  const { migrate } = await import("@/lib/db/migrate");
  const { createArticle, publishArticle } = await import("@/lib/services/articles");
  migrate();
  const draft = createArticle(articleInput({ bodyZh: "第一版正文" }));
  return publishArticle(draft.id);
}

describe("publication proofs", () => {
  it("submits and polls an authenticated Wayback capture job", async () => {
    process.env.WAYBACK_ACCESS_KEY = "test-access";
    process.env.WAYBACK_SECRET_KEY = "test-secret";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ job_id: "job-1", status: "pending" }))
      .mockResolvedValueOnce(Response.json({ status: "success", timestamp: "20260713150000" }));
    vi.stubGlobal("fetch", fetchMock);
    const { captureWithWayback } = await import("@/lib/services/publication-proofs");

    await expect(captureWithWayback("https://blog.leesaitool.com/commentary/example")).resolves.toBe(
      "https://web.archive.org/web/20260713150000/https://blog.leesaitool.com/commentary/example",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://web.archive.org/save",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          authorization: "LOW test-access:test-secret",
        }),
      }),
    );
    expect(String(fetchMock.mock.calls[0]![1]?.body)).toContain("if_not_archived_within=0");
    expect(String(fetchMock.mock.calls[0]![1]?.body)).toContain("skip_first_archive=1");
    expect(String(fetchMock.mock.calls[0]![1]?.body)).toContain("js_behavior_timeout=0");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
        expect.stringMatching(/^https:\/\/web\.archive\.org\/save\/status\/job-1\?_t=\d+$/),
      expect.objectContaining({
        headers: {
          accept: "application/json",
          authorization: "LOW test-access:test-secret",
        },
      }),
    );
  });

  it("stores one immutable proof with independent Wayback and OpenTimestamps evidence", async () => {
    const article = await publishedArticle();
    const stamp = vi.fn(async () => Uint8Array.of(0, 1, 2, 3));
    const capture = vi.fn(async () => "https://web.archive.org/web/20260713150000/https://blog.leesaitool.com/commentary/short-note-with-warmth");
    const { createPublicationProof, listPublicationProofs } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp,
      capture,
    });

    expect(proof).toMatchObject({
      articleId: article.id,
      publicUrl: "https://blog.leesaitool.com/commentary/short-note-with-warmth",
      waybackStatus: "complete",
      otsStatus: "complete",
      waybackUrl: expect.stringContaining("web.archive.org/web/20260713150000"),
      documentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(stamp).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("https://blog.leesaitool.com/commentary/short-note-with-warmth");
    expect(fs.readFileSync(path.join(tmpDir, proof!.documentPath), "utf8")).toContain("第一版正文");
    expect([...fs.readFileSync(path.join(tmpDir, proof!.otsPath!))]).toEqual([0, 1, 2, 3]);
    expect(listPublicationProofs(article.id)).toHaveLength(1);
  });

  it("does not create another proof when published content is unchanged", async () => {
    const article = await publishedArticle();
    const stamp = vi.fn(async () => Uint8Array.of(1));
    const capture = vi.fn(async () => "https://web.archive.org/web/20260713150000/example");
    const { createPublicationProof, listPublicationProofs } = await import("@/lib/services/publication-proofs");
    const services = { now: () => new Date("2026-07-13T15:00:00.000Z"), stamp, capture };

    const first = await createPublicationProof(article, services);
    const duplicate = await createPublicationProof({ ...article, updatedAt: "2026-07-13T16:00:00.000Z" }, services);

    expect(duplicate?.id).toBe(first?.id);
    expect(stamp).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
    expect(listPublicationProofs(article.id)).toHaveLength(1);
  });

  it("keeps successful OpenTimestamps evidence when Wayback fails", async () => {
    const article = await publishedArticle();
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp: async () => Uint8Array.of(9, 9),
      capture: async () => {
        throw new Error("Wayback unavailable");
      },
    });

    expect(proof).toMatchObject({
      otsStatus: "complete",
      waybackStatus: "failed",
      waybackError: "Wayback unavailable",
    });
    expect(fs.existsSync(path.join(tmpDir, proof!.otsPath!))).toBe(true);
  });

  it("retries only the failed service when identical content is saved again", async () => {
    const article = await publishedArticle();
    const stamp = vi.fn(async () => Uint8Array.of(4, 2));
    const capture = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Wayback unavailable"))
      .mockResolvedValueOnce("https://web.archive.org/web/20260713160000/example");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    const services = { now: () => new Date("2026-07-13T15:00:00.000Z"), stamp, capture };

    const failed = await createPublicationProof(article, services);
    const retried = await createPublicationProof(article, services);

    expect(retried?.id).toBe(failed?.id);
    expect(stamp).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(retried).toMatchObject({ otsStatus: "complete", waybackStatus: "complete" });
  });

  it("serves only the recorded OTS receipt as an attachment", async () => {
    const article = await publishedArticle();
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp: async () => Uint8Array.of(7, 8, 9),
      capture: async () => "https://web.archive.org/web/20260713150000/example",
    });
    const route = await import("@/app/proofs/[id]/ots/route");

    const response = await route.GET(new Request("http://localhost/proofs/1/ots"), {
      params: Promise.resolve({ id: String(proof!.id) }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`publication-proof-${proof!.id}.json.ots`);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([7, 8, 9]);
  });

  it("serves the immutable source document needed to verify an OTS receipt", async () => {
    const article = await publishedArticle();
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp: async () => Uint8Array.of(1),
      capture: async () => "https://web.archive.org/web/20260713150000/example",
    });
    const route = await import("@/app/proofs/[id]/source/route");

    const response = await route.GET(new Request("http://localhost/proofs/1/source"), {
      params: Promise.resolve({ id: String(proof!.id) }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`publication-proof-${proof!.id}.json`);
    expect(await response.text()).toContain("第一版正文");
  });
});
