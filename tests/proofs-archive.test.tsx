import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ProofsPage from "@/app/proofs/page";
import { listPublicPublicationProofs } from "@/lib/services/publication-proofs";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-proofs-page-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("public proof archive", () => {
  it("exposes verification facts without filesystem paths or failure details", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "可验证的文章", slug: "verifiable" })).id);
    await createPublicationProof(article, {
      now: () => new Date("2026-07-15T10:00:00.000Z"),
      stamp: async () => {
        throw new Error("/private/server/path must never leak");
      },
      capture: async () => {
        throw new Error("secret upstream response");
      },
    });

    const [publicProof] = listPublicPublicationProofs();

    expect(publicProof).toMatchObject({ articleTitle: "可验证的文章", otsStatus: "failed", waybackStatus: "failed" });
    expect(publicProof).not.toHaveProperty("documentPath");
    expect(publicProof).not.toHaveProperty("otsPath");
    expect(publicProof).not.toHaveProperty("otsError");
    expect(publicProof).not.toHaveProperty("waybackError");
  });

  it("groups proofs by article and links every available verification artifact", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "公开证明文章", slug: "public-proof" })).id);
    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-15T11:00:00.000Z"),
      stamp: async () => Uint8Array.of(1, 2, 3),
      capture: async () => "https://web.archive.org/web/20260715110000/https://blog.leesaitool.com/commentary/public-proof",
    });

    render(await ProofsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Proofs" })).toBeVisible();
    expect(screen.getByText("1 proof")).toBeVisible();
    expect(screen.getByText("1 article")).toBeVisible();
    expect(screen.getByText("2 complete")).toBeVisible();
    expect(screen.getByText("0 pending")).toBeVisible();
    expect(screen.getByText("0 failed")).toBeVisible();
    const group = screen.getByRole("region", { name: "公开证明文章" });
    expect(within(group).getByRole("link", { name: "公开证明文章" })).toHaveAttribute("href", "/commentary/public-proof");
    expect(within(group).getByRole("link", { name: "Source JSON" })).toHaveAttribute("href", `/proofs/${proof!.id}/source`);
    expect(within(group).getByRole("link", { name: "OpenTimestamps" })).toHaveAttribute("href", `/proofs/${proof!.id}/ots`);
    expect(within(group).getByRole("link", { name: "Wayback snapshot" })).toHaveAttribute("href", proof!.waybackUrl);
    expect(screen.queryByText(/private\/server\/path|secret upstream response|proofs\/\d+\/.*\.json/)).not.toBeInTheDocument();
  });

  it("does not list proof records for an unpublished article", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle, unpublishArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "已撤下文章", slug: "withdrawn" })).id);
    await createPublicationProof(article, {
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      stamp: async () => Uint8Array.of(1),
      capture: async () => "https://web.archive.org/example",
    });
    unpublishArticle(article.id);

    expect(listPublicPublicationProofs()).toEqual([]);
  });
});
