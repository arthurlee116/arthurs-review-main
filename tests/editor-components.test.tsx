import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleEditor } from "@/components/studio/ArticleEditor";
import { ImageUploader } from "@/components/studio/ImageUploader";
import { MarkdownEditor } from "@/components/studio/MarkdownEditor";
import { TranslateMissingEnglishButton } from "@/components/studio/TranslateMissingEnglishButton";
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

function StatefulMarkdownEditor({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <MarkdownEditor label="Chinese body" value={value} onChange={setValue} />;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("MarkdownEditor", () => {
  it("shows a sanitized markdown preview beside the editor", () => {
    const { container } = render(<MarkdownEditor label="Chinese body" value={"# 一级标题\n\n## 标题\n\n- 项目\n\n正文"} onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: "Chinese body" })).toBeVisible();
    expect(container.querySelector(".cm-editor")).toBeInTheDocument();
    const preview = within(container.querySelector(".prose") as HTMLElement);
    expect(screen.getByRole("heading", { level: 2, name: "一级标题" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "标题" })).toBeVisible();
    expect(preview.getByText("项目").closest("ul")).toBeInTheDocument();
    expect(preview.getByText("正文")).toBeVisible();
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

    const inlineImagePicker = screen.getByLabelText("Insert inline image");
    expect(inlineImagePicker.closest(".studio-button")).toBeTruthy();

    await user.upload(inlineImagePicker, new File(["image"], "inline.png", { type: "image/png" }));

    expect(onChange).toHaveBeenCalledWith("正文\n\n![inline](/media/2026/05/inline.webp)");
  });

  it("accepts a dropped inline image and inserts the public markdown image link", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          publicPath: "/media/2026/05/dropped.webp",
        }),
      ),
    );

    render(<MarkdownEditor label="Chinese body" value="正文" onChange={onChange} />);

    const file = new File(["image"], "dropped.png", { type: "image/png" });
    fireEvent.drop(screen.getByLabelText("Chinese body image drop target"), {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file", type: "image/png" }],
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("正文\n\n![dropped](/media/2026/05/dropped.webp)"));
  });

  it("imports a markdown file into an empty editor and updates the preview", async () => {
    const user = userEvent.setup();
    render(<StatefulMarkdownEditor />);

    await user.upload(screen.getByLabelText("Import Markdown"), new File(["## Imported\n\nBody"], "draft.md", { type: "text/markdown" }));

    expect(screen.getByRole("textbox", { name: "Chinese body" })).toHaveTextContent(/## Imported\s*Body/);
    expect(screen.getByRole("heading", { name: "Imported" })).toBeVisible();
  });

  it("blocks markdown import when the editor already has content", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MarkdownEditor label="Chinese body" value="Existing body" onChange={onChange} />);

    await user.upload(screen.getByLabelText("Import Markdown"), new File(["## Imported"], "draft.md", { type: "text/markdown" }));

    expect(screen.getByText("Clear this body before importing Markdown.")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports clean markdown", async () => {
    const user = userEvent.setup();
    render(<MarkdownEditor label="Chinese body" value={"## Good\n\nBody with **bold** text."} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Check Markdown" }));

    expect(screen.getByText("Markdown looks clean.")).toBeVisible();
  });

  it("reports heading and emphasis leftovers with line numbers", async () => {
    const user = userEvent.setup();
    render(<MarkdownEditor label="Chinese body" value={"#Bad\n\nThis has a stray * marker."} onChange={() => {}} />);
    const editor = screen.getByRole("textbox", { name: "Chinese body" });

    await user.click(screen.getByRole("button", { name: "Check Markdown" }));

    expect(screen.getByText("Line 1: Add a space after heading markers.")).toBeVisible();
    expect(screen.getByText("Line 3: Check unmatched emphasis markers.")).toBeVisible();
    expect(editor).toHaveFocus();
    expect(document.getSelection()?.toString()).toBe("#Bad");
  });
});

describe("ImageUploader", () => {
  it("uses the Studio button treatment for cover image uploads", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          relativePath: "2026/05/cover.webp",
        }),
      ),
    );

    render(<ImageUploader onUploaded={onUploaded} />);

    const coverImagePicker = screen.getByLabelText("Choose cover image");
    expect(coverImagePicker.closest(".studio-button")).toBeTruthy();

    await user.upload(coverImagePicker, new File(["image"], "cover.png", { type: "image/png" }));

    expect(screen.getByText("cover.png")).toBeVisible();
    expect(screen.getByText("Image uploaded")).toBeVisible();
    expect(onUploaded).toHaveBeenCalledWith("2026/05/cover.webp");
  });

  it("accepts a dropped cover image", async () => {
    const onUploaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          relativePath: "2026/05/dropped-cover.webp",
        }),
      ),
    );

    render(<ImageUploader onUploaded={onUploaded} />);

    const file = new File(["image"], "dropped-cover.png", { type: "image/png" });
    fireEvent.drop(screen.getByLabelText("Cover image drop target"), {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file", type: "image/png" }],
      },
    });

    expect(await screen.findByText("dropped-cover.png")).toBeVisible();
    expect(screen.getByText("Image uploaded")).toBeVisible();
    expect(onUploaded).toHaveBeenCalledWith("2026/05/dropped-cover.webp");
  });
});

describe("ArticleEditor", () => {
  it("shows and saves the English excerpt field", () => {
    render(<ArticleEditor article={article({ excerptEn: "English excerpt" })} />);

    expect(screen.getByRole("textbox", { name: "English excerpt" })).toHaveValue("English excerpt");
  });

  it("translates Chinese fields into English fields without saving", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({
        translation: {
          titleEn: "Morality and Reason",
          excerptEn: "Where do all these villains come from?",
          bodyEn: "English body.",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArticleEditor article={article({ titleZh: "道德与理性", excerptZh: "哪里来那么多坏人", bodyZh: "中文正文" })} />);

    await user.click(screen.getByRole("button", { name: "Translate to English" }));

    expect(await screen.findByText("Translation ready. Review before saving.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "English title" })).toHaveValue("Morality and Reason");
    expect(screen.getByRole("textbox", { name: "English excerpt" })).toHaveValue("Where do all these villains come from?");
    expect(screen.getByRole("textbox", { name: "English body" })).toHaveTextContent("English body.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/studio/api/translations/article",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          titleZh: "道德与理性",
          excerptZh: "哪里来那么多坏人",
          bodyZh: "中文正文",
        }),
      }),
    );
  });

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

describe("TranslateMissingEnglishButton", () => {
  it("shows saved batch translation results", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          summary: { attempted: 2, succeeded: 1, failed: 1 },
          successes: [{ id: 1, titleZh: "道德与理性" }],
          failures: [{ id: 2, titleZh: "反战的人们，醒醒了！", error: "OpenRouter request failed with status 429." }],
        }),
      ),
    );

    render(<TranslateMissingEnglishButton />);

    await user.click(screen.getByRole("button", { name: "Translate missing English" }));

    expect(await screen.findByText("Attempted 2. Saved 1. Failed 1.")).toBeVisible();
    expect(screen.getByText("Saved: 道德与理性")).toBeVisible();
    expect(screen.getByText("Failed: 反战的人们，醒醒了！ - OpenRouter request failed with status 429.")).toBeVisible();
  });
});
