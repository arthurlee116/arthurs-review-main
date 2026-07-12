import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("shows the contact notice on the homepage", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    render(await HomePage());

    expect(await screen.findByRole("dialog", { name: "留言" })).toBeInTheDocument();
    expect(screen.getAllByText(contactNotice).length).toBeGreaterThanOrEqual(2);
  });

  it("does not reopen the contact notice modal after it is closed", async () => {
    const user = userEvent.setup();
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    render(await HomePage());

    expect(await screen.findByRole("dialog", { name: "留言" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "留言" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("arthurs-review.contactPromptSeen")).toBe("1");
  });

  it("skips the contact notice modal once this browser has seen it", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    migrate();
    window.localStorage.setItem("arthurs-review.contactPromptSeen", "1");

    render(await HomePage());

    expect(screen.queryByRole("dialog", { name: "留言" })).not.toBeInTheDocument();
  });

  it("still closes the contact notice modal when localStorage is blocked", async () => {
    const user = userEvent.setup();
    const { migrate } = await import("@/lib/db/migrate");
    migrate();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
        setItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
      },
    });

    render(await HomePage());

    expect(await screen.findByRole("dialog", { name: "留言" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "留言" })).not.toBeInTheDocument();
  });

  it("uses a native dialog for the contact notice prompt", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    const { container } = render(await HomePage());

    expect(await screen.findByRole("dialog", { name: "留言" })).toBeInTheDocument();
    expect(container.querySelector("dialog.contact-modal-panel")).toBeInTheDocument();
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
    expect(await screen.findByRole("dialog", { name: "留言" })).toBeInTheDocument();
    expect(screen.getAllByText(contactNotice).length).toBeGreaterThanOrEqual(2);
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
});
