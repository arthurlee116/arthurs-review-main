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
  delete process.env.OTS_ESPLORA_URLS;
});

async function publishedArticle() {
  const { migrate } = await import("@/lib/db/migrate");
  const { createArticle, publishArticle } = await import("@/lib/services/articles");
  migrate();
  const draft = createArticle(articleInput({ bodyZh: "第一版正文" }));
  return publishArticle(draft.id);
}

describe("publication proofs", () => {
  it("keeps a newly stamped receipt pending until Bitcoin verification succeeds", async () => {
    const article = await publishedArticle();
    const verify = vi.fn(async () => "anchored" as const);
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T14:00:00.000Z"),
      stamp: async () => Uint8Array.of(1, 2, 3),
      upgrade: async () => "pending_confirmation",
      verify,
      capture: async () => "https://web.archive.org/example",
    });

    expect(proof).toMatchObject({ otsStatus: "pending_confirmation", otsPath: expect.stringMatching(/\.ots$/) });
    expect(verify).not.toHaveBeenCalled();
  });

  it("marks a receipt anchored only after upgrade and verify both succeed", async () => {
    const article = await publishedArticle();
    const upgrade = vi.fn(async () => "complete" as const);
    const verify = vi.fn(async () => "anchored" as const);
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T14:01:00.000Z"),
      stamp: async () => Uint8Array.of(4, 5, 6),
      upgrade,
      verify,
      capture: async () => "https://web.archive.org/example",
    });

    expect(proof?.otsStatus).toBe("anchored");
    expect(upgrade).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("does not trust a partial receipt left by a failed stamp command", async () => {
    const article = await publishedArticle();
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T14:02:00.000Z"),
      stamp: async (documentPath) => {
        fs.writeFileSync(`${documentPath}.ots`, Uint8Array.of(9));
        throw new Error("stamp failed after partial output");
      },
      upgrade: async () => "complete",
      verify: async () => "anchored",
      capture: async () => "https://web.archive.org/example",
    });

    expect(proof).toMatchObject({ otsStatus: "verification_failed", otsPath: null, otsError: "stamp failed after partial output" });
    expect(fs.existsSync(`${path.join(tmpDir, proof!.documentPath)}.ots`)).toBe(false);
  });

  it("records a permanent verify error without claiming an anchor", async () => {
    const article = await publishedArticle();
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");

    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T14:03:00.000Z"),
      stamp: async () => Uint8Array.of(7),
      upgrade: async () => "complete",
      verify: async () => {
        throw new Error("receipt does not match source");
      },
      capture: async () => "https://web.archive.org/example",
    });

    expect(proof).toMatchObject({ otsStatus: "verification_failed", otsError: "receipt does not match source" });
  });

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
      upgrade: async () => "complete",
      verify: async () => "anchored",
      capture,
    });

    expect(proof).toMatchObject({
      articleId: article.id,
      publicUrl: "https://blog.leesaitool.com/commentary/short-note-with-warmth",
      waybackStatus: "complete",
      otsStatus: "anchored",
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

  it("creates one idempotent source record before background evidence jobs run", async () => {
    const article = await publishedArticle();
    const { ensurePublicationProofRecord, listPublicationProofs } = await import("@/lib/services/publication-proofs");
    const options = { createdAt: "2026-07-13T15:00:00.000Z" };

    const first = ensurePublicationProofRecord(article, options);
    const duplicate = ensurePublicationProofRecord(article, options);

    expect(duplicate?.id).toBe(first?.id);
    expect(first).toMatchObject({ articleId: article.id, articleRevisionId: article.revisionId, otsStatus: "submitted", waybackStatus: "pending" });
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
      otsStatus: "pending_confirmation",
      waybackStatus: "failed",
      waybackError: "Wayback unavailable",
    });
    expect(fs.existsSync(path.join(tmpDir, proof!.otsPath!))).toBe(true);
  });

  it("persists a Wayback failure for the durable worker to retry", async () => {
    const article = await publishedArticle();
    const capture = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Wayback unavailable"))
      .mockResolvedValueOnce("https://web.archive.org/web/20260713160000/example");
    const { captureWaybackProof, ensurePublicationProofRecord, getPublicationProof } = await import("@/lib/services/publication-proofs");
    const proof = ensurePublicationProofRecord(article, { createdAt: "2026-07-13T15:00:00.000Z" })!;

    await expect(captureWaybackProof(proof.id, capture)).rejects.toThrow("Wayback unavailable");
    expect(getPublicationProof(proof.id)).toMatchObject({ waybackStatus: "failed", waybackError: "Wayback unavailable" });
    await expect(captureWaybackProof(proof.id, capture)).resolves.toMatchObject({ waybackStatus: "complete", waybackError: null });

    expect(capture).toHaveBeenCalledTimes(2);
    const source = fs.readFileSync("src/lib/services/publication-proofs.ts", "utf8");
    expect(source).not.toContain("__arthursReviewProofRuntime");
    expect(source).not.toContain("waybackRetries");
    expect(source).not.toContain("WAYBACK_RETRY_DELAY_MS");
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
    expect(retried).toMatchObject({ otsStatus: "pending_confirmation", waybackStatus: "complete" });
  });

  it("recovers a verification_failed proof once the verify error clears", async () => {
    const article = await publishedArticle();
    let verifyAttempts = 0;
    const { advanceOpenTimestampProof, ensurePublicationProofRecord } = await import("@/lib/services/publication-proofs");
    const proof = ensurePublicationProofRecord(article, { createdAt: "2026-07-13T15:00:00.000Z" })!;
    const services = {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp: async () => Uint8Array.of(5, 6, 7),
      upgrade: async () => "complete" as const,
      verify: async () => {
        verifyAttempts += 1;
        if (verifyAttempts === 1) throw new Error("Could not connect to Bitcoin node");
        return "anchored" as const;
      },
      capture: async () => "https://web.archive.org/example",
    };

    const failed = await advanceOpenTimestampProof(proof.id, services);
    expect(failed).toMatchObject({ otsStatus: "verification_failed", otsError: "Could not connect to Bitcoin node" });

    const recovered = await advanceOpenTimestampProof(proof.id, services);
    expect(recovered).toMatchObject({ otsStatus: "anchored", otsError: null });
    expect(verifyAttempts).toBe(2);
  });

  it("re-stamps when a failed proof has no usable receipt", async () => {
    const article = await publishedArticle();
    const stamp = vi
      .fn<() => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error("calendar unreachable"))
      .mockResolvedValueOnce(Uint8Array.of(8, 8, 8));
    const { advanceOpenTimestampProof, ensurePublicationProofRecord } = await import("@/lib/services/publication-proofs");
    const proof = ensurePublicationProofRecord(article, { createdAt: "2026-07-13T15:00:00.000Z" })!;
    const services = {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp,
      upgrade: async () => "complete" as const,
      verify: async () => "anchored" as const,
      capture: async () => "https://web.archive.org/example",
    };

    const failed = await advanceOpenTimestampProof(proof.id, services);
    expect(failed).toMatchObject({ otsStatus: "verification_failed", otsPath: null });

    const recovered = await advanceOpenTimestampProof(proof.id, services);
    expect(recovered).toMatchObject({ otsStatus: "anchored", otsPath: expect.stringMatching(/\.ots$/) });
    expect(stamp).toHaveBeenCalledTimes(2);
  });

  it("parses Bitcoin attestations from --no-bitcoin verify output", async () => {
    const { __testables } = await import("@/lib/services/publication-proofs");
    const output = [
      "Not checking Bitcoin attestation; Bitcoin disabled",
      "To verify manually, check that Bitcoin block 957872 has merkleroot 328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310",
      "To verify manually, check that Bitcoin block 957919 has merkleroot 4b8128bf7aeae3262929d1a7c0feb38995b677834b3dbbb6ccc49820bea012a7",
    ].join("\n");

    expect(__testables.parseAttestations(output)).toEqual([
      { height: 957872, merkleRoot: "328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310" },
      { height: 957919, merkleRoot: "4b8128bf7aeae3262929d1a7c0feb38995b677834b3dbbb6ccc49820bea012a7" },
    ]);
    expect(__testables.parseAttestations("Calendar https://x: Pending confirmation in Bitcoin blockchain")).toEqual([]);
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

  describe("esplora fallback verification", () => {
    it("returns the merkle root from the first working endpoint", async () => {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({}, { status: 500 }))
        .mockResolvedValueOnce(new Response("00000000000000000001b2e0e3d0a8c9f7f6e5d4c3b2a190807060504030201000"))
        .mockResolvedValueOnce(Response.json({ merkle_root: "a".repeat(64) }));
      vi.stubGlobal("fetch", fetchMock);
      process.env.OTS_ESPLORA_URLS = "https://first.invalid/api,https://second.invalid/api";
      const { __testables } = await import("@/lib/services/publication-proofs");

      await expect(__testables.fetchEsploraMerkleRoot(957872)).resolves.toBe("a".repeat(64));

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://first.invalid/api/block-height/957872", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://second.invalid/api/block-height/957872", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(fetchMock).toHaveBeenNthCalledWith(3, "https://second.invalid/api/block/00000000000000000001b2e0e3d0a8c9f7f6e5d4c3b2a190807060504030201000", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it("propagates the last error when every endpoint fails", async () => {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({}, { status: 429 }))
        .mockResolvedValueOnce(Response.json({}, { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);
      process.env.OTS_ESPLORA_URLS = "https://first.invalid/api,https://second.invalid/api";
      const { __testables } = await import("@/lib/services/publication-proofs");

      await expect(__testables.fetchEsploraMerkleRoot(957872)).rejects.toThrow("HTTP 503");
    });

    it("fails when the block response is missing a valid merkle_root", async () => {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("00000000000000000001b2e0e3d0a8c9f7f6e5d4c3b2a190807060504030201000"))
        .mockResolvedValueOnce(Response.json({ merkle_root: "not-a-hash" }));
      vi.stubGlobal("fetch", fetchMock);
      process.env.OTS_ESPLORA_URLS = "https://only.invalid/api";
      const { __testables } = await import("@/lib/services/publication-proofs");

      await expect(__testables.fetchEsploraMerkleRoot(957872)).rejects.toThrow("missing merkle_root");
    });

    it("returns anchored when every attestation matches the public merkle root", async () => {
      const { __testables } = await import("@/lib/services/publication-proofs");
      const fetchMerkleRoot = vi.fn(async () => "328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310");

      await expect(__testables.verifyAttestationsAgainstEsplora(
        [{ height: 957872, merkleRoot: "328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310" }],
        fetchMerkleRoot,
      )).resolves.toBe("anchored");
      expect(fetchMerkleRoot).toHaveBeenCalledOnce();
    });

    it("throws a mismatch error when a merkle root differs from the receipt", async () => {
      const { __testables } = await import("@/lib/services/publication-proofs");
      const fetchMerkleRoot = vi.fn(async () => "f".repeat(64));

      await expect(__testables.verifyAttestationsAgainstEsplora(
        [{ height: 957872, merkleRoot: "328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310" }],
        fetchMerkleRoot,
      )).rejects.toThrow("Bitcoin block 957872 merkle root mismatch");
    });

    it("wraps a fetch failure with the block height in context", async () => {
      const { __testables } = await import("@/lib/services/publication-proofs");
      const fetchMerkleRoot = vi.fn(async () => { throw new Error("HTTP 429"); });

      await expect(__testables.verifyAttestationsAgainstEsplora(
        [{ height: 957872, merkleRoot: "328057b7a2b69269f38f386061f5b58d6745fec8cd53fcc223f9265971076310" }],
        fetchMerkleRoot,
      )).rejects.toThrow("Could not fetch Bitcoin block 957872 for verification");
    });
  });
});
