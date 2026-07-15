import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticlePage } from "@/app/_articlePage";
import HomePage from "@/app/page";
import { articleInput } from "@/test/factories";

let tmpDir: string;
const contactNotice = "非常欢迎向我的邮箱（laoliarthur@outlook.com）或者微信（bookspiano）留言，说说你的想法，给我提意见！";

beforeEach(async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-public-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("public article pages", () => {
  it("shows a non-blocking contact notice without mounting a dialog", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    render(await HomePage());

    expect(screen.queryByRole("dialog", { name: "留言" })).not.toBeInTheDocument();
    expect(screen.getAllByText(contactNotice)).toHaveLength(1);
    expect(fs.existsSync("src/components/ContactPromptModal.tsx")).toBe(false);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
    expect(within(footer).getByRole("link", { name: "Proofs" })).toHaveAttribute("href", "/proofs");
    expect(within(footer).getByRole("link", { name: "RSS" })).toHaveAttribute("href", "/feed.xml");
    expect(within(footer).getByRole("link", { name: "laoliarthur@outlook.com" })).toHaveAttribute("href", "mailto:laoliarthur@outlook.com");
    await user.click(within(footer).getByRole("button", { name: "复制微信号 bookspiano" }));
    expect(writeText).toHaveBeenCalledWith("bookspiano");
    expect(within(footer).getByRole("status")).toHaveTextContent("微信号已复制");
  });

  it("offers concrete article feedback by email and copied WeChat id", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();
    const article = publishArticle(createArticle(articleInput({ titleZh: "欢迎反驳的文章", slug: "feedback-wanted" })).id);

    render(await ArticlePage({ category: article.category, slug: article.slug }));

    expect(screen.getByRole("heading", { name: "读完了？来挑错。" })).toBeInTheDocument();
    expect(screen.getByText("哪一段最站不住脚？有没有事实错误或我忽略的视角？你希望我接着写什么？")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "邮件反馈" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("关于《欢迎反驳的文章》的反馈")),
    );
    await user.click(screen.getByRole("button", { name: "复制微信号" }));
    expect(writeText).toHaveBeenCalledWith("bookspiano");
    expect(screen.getByRole("status")).toHaveTextContent("微信号已复制");
  });

  it("renders an article cover image when one is configured", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "有封面的文章",
        slug: "with-cover",
        category: "society",
        coverImagePath: "uploads/2026/05/cover.webp",
        bodyZh: "正文。",
      }),
    );
    publishArticle(article.id);

    render(await ArticlePage({ category: "society", slug: "with-cover" }));

    const image = screen.getByRole("img", { name: "有封面的文章" });
    expect(image).toHaveAttribute("src", "/media/2026/05/cover.webp");
  });

  it("keeps article pages to one h1 and emits BlogPosting JSON-LD", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "真正的页面标题",
        slug: "structured-article",
        category: "commentary",
        seoDescription: "给搜索引擎看的短描述。",
        coverImagePath: "uploads/2026/05/cover.webp",
        bodyZh: "# 正文里不该再抢 H1\n\n正文。",
      }),
    );
    const published = publishArticle(article.id);

    const { container } = render(await ArticlePage({ category: "commentary", slug: "structured-article" }));
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("真正的页面标题");
    expect(screen.queryByRole("dialog", { name: "留言" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "读完了？来挑错。" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "正文里不该再抢 H1" })).toBeInTheDocument();

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent!));
    expect(jsonLd).toHaveLength(2);
    expect(jsonLd.find((item) => item["@type"] === "BlogPosting")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "真正的页面标题",
      description: "给搜索引擎看的短描述。",
      url: "https://blog.leesaitool.com/commentary/structured-article",
      datePublished: published.publishedAt,
      dateModified: published.updatedAt,
      author: {
        "@type": "Person",
        name: "Arthur",
      },
      publisher: {
        "@type": "Organization",
        name: "Arthur's Review",
        url: "https://blog.leesaitool.com/",
      },
      image: ["https://blog.leesaitool.com/media/2026/05/cover.webp"],
    });
    expect(jsonLd.find((item) => item["@type"] === "BreadcrumbList")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Arthur's Review",
          item: "https://blog.leesaitool.com/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "时事评论",
          item: "https://blog.leesaitool.com/commentary",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "真正的页面标题",
          item: "https://blog.leesaitool.com/commentary/structured-article",
        },
      ],
    });
  });

  it("shows publication evidence in a muted native disclosure", async () => {
    const user = userEvent.setup();
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { createPublicationProof } = await import("@/lib/services/publication-proofs");
    migrate();
    const article = publishArticle(createArticle(articleInput()).id);
    const proof = await createPublicationProof(article, {
      now: () => new Date("2026-07-13T15:00:00.000Z"),
      stamp: async () => Uint8Array.of(1, 2, 3),
      capture: async () => "https://web.archive.org/web/20260713150000/https://blog.leesaitool.com/commentary/short-note-with-warmth",
    });

    const { container } = render(await ArticlePage({ category: "commentary", slug: article.slug }));
    const summary = screen.getByText("Proof of Publication");
    const details = summary.closest("details");

    expect(details).not.toHaveAttribute("open");
    expect(summary).toHaveClass("text-xs", "text-[var(--muted)]");
    await user.click(summary);
    expect(details).toHaveAttribute("open");
    expect(
      screen.getByText("This article may have been published earlier, but this proof shows it existed no later than the date below."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wayback snapshot" })).toHaveAttribute("href", proof!.waybackUrl);
    expect(screen.getByText(proof!.documentSha256)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download source" })).toHaveAttribute("href", `/proofs/${proof!.id}/source`);
    expect(screen.getByRole("link", { name: "Download OTS" })).toHaveAttribute("href", `/proofs/${proof!.id}/ots`);
    expect(container.querySelector("details > summary")).toBe(summary);
  });
});
