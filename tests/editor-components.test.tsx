import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleEditor } from "@/components/studio/ArticleEditor";
import { MarkdownEditor } from "@/components/studio/MarkdownEditor";
import type { Article } from "@/lib/services/articles";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 7,
    titleZh: "测试文章",
    titleEn: null,
    slug: "test-article",
    category: "commentary",
    status: "draft",
    publishedAt: null,
    updatedAt: "2026-05-04T00:00:00.000Z",
    excerptZh: "测试摘要",
    excerptEn: null,
    coverImagePath: null,
    isFeatured: false,
    seoDescription: "测试 SEO 描述",
    bodyZhPath: "articles/test-article.zh.md",
    bodyEnPath: null,
    tags: [],
    bodyZh: "中文正文",
    bodyEn: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("MarkdownEditor", () => {
  it("shows a sanitized markdown preview beside the editor", () => {
    render(<MarkdownEditor label="Chinese body" value={"## 标题\n\n正文"} onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: "Chinese body" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "标题" })).toBeVisible();
    expect(screen.getByText("正文")).toBeVisible();
  });

  it("uploads an inline image and inserts the public markdown image link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          publicPath: "/media/2026/05/inline.webp",
        }),
      ),
    );

    render(<MarkdownEditor label="Chinese body" value="正文" onChange={onChange} />);

    await user.upload(screen.getByLabelText("Insert inline image"), new File(["image"], "inline.png", { type: "image/png" }));

    expect(onChange).toHaveBeenCalledWith("正文\n\n![inline](/media/2026/05/inline.webp)");
  });
});

describe("ArticleEditor", () => {
  it("flashes the publish button green for two seconds after a successful publish", async () => {
    vi.useFakeTimers();
    const publishedArticle = article({ status: "published", publishedAt: "2026-05-04T00:00:00.000Z" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ article: article() }))
        .mockResolvedValueOnce(Response.json({ article: publishedArticle })),
    );

    render(<ArticleEditor article={article()} />);

    const publishButton = screen.getByRole("button", { name: "Publish" });
    await act(async () => {
      fireEvent.click(publishButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Published")).toBeVisible();
    expect(publishButton).toHaveClass("studio-button-success");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(publishButton).not.toHaveClass("studio-button-success");
  });

  it("flashes the publish button red for two seconds when publish cannot save first", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "Chinese body is required" }, { status: 400 })));

    render(<ArticleEditor article={article()} />);

    const publishButton = screen.getByRole("button", { name: "Publish" });
    await act(async () => {
      fireEvent.click(publishButton);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Save failed: Chinese body is required")).toBeVisible();
    expect(publishButton).toHaveClass("studio-button-error");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(publishButton).not.toHaveClass("studio-button-error");
  });
});
