import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/studio/ArticleEditor", () => ({
  ArticleEditor: () => <div>Editor</div>,
}));
vi.mock("@/lib/services/articles", () => ({
  getArticleById: vi.fn(() => ({ id: 12, status: "published" })),
}));
vi.mock("@/lib/services/tags", () => ({ listTags: vi.fn(() => []) }));
vi.mock("@/lib/services/publication-proofs", () => ({
  listPublicationProofs: vi.fn(() => [
    {
      id: 9,
      createdAt: "2026-07-13T15:00:00.000Z",
      otsStatus: "complete",
      otsError: null,
      waybackStatus: "failed",
      waybackError: "Wayback unavailable",
    },
  ]),
}));

describe("publication proof status in Studio", () => {
  it("shows independent service failures on the article editor page", async () => {
    const { default: EditArticlePage } = await import("@/app/studio/(protected)/articles/[id]/page");
    render(await EditArticlePage({ params: Promise.resolve({ id: "12" }) }));

    expect(screen.getByText("Publication proofs")).toBeInTheDocument();
    expect(screen.getByText("OpenTimestamps: complete")).toBeInTheDocument();
    expect(screen.getByText("Wayback: failed — Wayback unavailable")).toBeInTheDocument();
  });
});
