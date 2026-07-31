import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoWall } from "@/components/life/PhotoWall";
import type { Article } from "@/lib/services/articles";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 1,
    revisionId: 1,
    draftRevisionId: 1,
    publishedRevisionId: 1,
    titleZh: "生活随笔",
    titleEn: null,
    slug: "life-post",
    category: "life",
    status: "published",
    publishedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    excerptZh: "生活摘要",
    excerptEn: null,
    coverImagePath: "uploads/2026/07/cover.webp",
    isFeatured: false,
    seoDescription: "生活 SEO 描述",
    bodyZhPath: "articles/life-post.zh.md",
    bodyEnPath: null,
    tags: [],
    ...overrides,
  };
}

describe("PhotoWall", () => {
  it("renders one link per article pointing at /life/<slug>", () => {
    const articles = [
      article({ id: 1, slug: "first-post", titleZh: "第一篇" }),
      article({ id: 2, slug: "second-post", titleZh: "第二篇" }),
    ];

    render(<PhotoWall articles={articles} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href")).sort()).toEqual([
      "/life/first-post",
      "/life/second-post",
    ]);
  });

  it("lazy-loads cover images", () => {
    render(<PhotoWall articles={[article({ titleZh: "带封面的文章" })]} />);

    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("src", "/media/2026/07/cover.webp");
  });

  it("renders title text for each article", () => {
    render(<PhotoWall articles={[article({ titleZh: "周末爬山记" })]} />);

    expect(screen.getByText("周末爬山记")).toBeInTheDocument();
  });

  it("renders articles without covers as text cards", () => {
    render(
      <PhotoWall
        articles={[
          article({
            slug: "text-only",
            titleZh: "纯文字文章",
            coverImagePath: null,
            excerptZh: "没有封面的摘要",
          }),
        ]}
      />,
    );

    expect(screen.getByText("纯文字文章")).toBeInTheDocument();
    expect(screen.getByText("没有封面的摘要")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/life/text-only");
  });

  it("shows a media count badge on multi-photo articles", () => {
    render(<PhotoWall articles={[article({ id: 1 })]} mediaCounts={{ 1: 4 }} />);

    expect(screen.getByText("4 张")).toBeInTheDocument();
  });

  it("shows no badge for single-photo articles or missing counts", () => {
    render(
      <PhotoWall
        articles={[article({ id: 1, titleZh: "单图" }), article({ id: 2, slug: "other", titleZh: "无计数" })]}
        mediaCounts={{ 1: 1 }}
      />,
    );

    expect(screen.queryByText(/张$/)).not.toBeInTheDocument();
  });

  it("renders a stacked-photo edge behind multi-photo covers", () => {
    const { container } = render(<PhotoWall articles={[article({ id: 1 })]} mediaCounts={{ 1: 3 }} />);

    expect(container.querySelectorAll("[data-photo-stack]")).toHaveLength(1);
  });
});
