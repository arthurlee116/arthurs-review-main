import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LifeArticleView } from "@/components/life/LifeArticleView";
import type { Article } from "@/lib/services/articles";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, overrideSrc: _overrideSrc, ...rest } = props;
    return <img {...rest} />;
  },
}));

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 1,
    revisionId: 1,
    draftRevisionId: 1,
    publishedRevisionId: 1,
    titleZh: "2026年7月31日",
    titleEn: null,
    slug: "life-2026-07-31-a1b2",
    category: "life",
    status: "published",
    publishedAt: "2026-07-31T15:00:00.000Z",
    updatedAt: "2026-07-31T15:00:00.000Z",
    excerptZh: "今天吃了海鲜饭",
    excerptEn: null,
    coverImagePath: "uploads/2026/07/a.webp",
    isFeatured: false,
    seoDescription: "",
    bodyZhPath: "articles/life.zh.md",
    bodyEnPath: null,
    tags: [],
    bodyZh: "![](/media/2026/07/a.webp)\n![](/media/2026/07/b.mp4?poster=/media/2026/07/b-cover.webp)\n\n今天吃了海鲜饭",
    bodyEn: null,
    ...overrides,
  };
}

describe("LifeArticleView", () => {
  it("renders an img per image embed", () => {
    const { container } = render(<LifeArticleView article={article()} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/media/2026/07/a.webp");
    expect(images[0]).toHaveAttribute("loading", "lazy");
  });

  it("renders video embeds as video elements with controls and poster", () => {
    const { container } = render(<LifeArticleView article={article()} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("poster", "/media/2026/07/b-cover.webp");
    expect(video?.querySelector("source")).toHaveAttribute("src", "/media/2026/07/b.mp4");
  });

  it("renders the caption as paragraphs", () => {
    render(<LifeArticleView article={article()} />);
    expect(screen.getByText("今天吃了海鲜饭")).toBeInTheDocument();
  });

  it("renders the title", () => {
    render(<LifeArticleView article={article()} />);
    expect(screen.getByRole("heading", { name: "2026年7月31日" })).toBeInTheDocument();
  });
});
