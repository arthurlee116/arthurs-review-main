import { describe, expect, it } from "vitest";
import { buildLifePost, type UploadedMedia } from "@/lib/studio/life-post";

const now = new Date("2026-07-31T15:04:00");

function image(overrides: Partial<UploadedMedia> = {}): UploadedMedia {
  return {
    kind: "image",
    publicPath: "/media/2026/07/a.webp",
    relativePath: "uploads/2026/07/a.webp",
    ...overrides,
  };
}

function video(overrides: Partial<UploadedMedia> = {}): UploadedMedia {
  return {
    kind: "video",
    publicPath: "/media/2026/07/b.mp4",
    coverPublicPath: "/media/2026/07/b-cover.webp",
    relativePath: "uploads/2026/07/b.mp4",
    coverRelativePath: "uploads/2026/07/b-cover.webp",
    ...overrides,
  };
}

describe("buildLifePost", () => {
  it("uses the local date as the title", () => {
    const post = buildLifePost([image()], "hello", now);
    expect(post.titleZh).toBe("2026年7月31日");
  });

  it("generates a slug from the date plus a random suffix", () => {
    const post = buildLifePost([image()], "", now);
    expect(post.slug).toMatch(/^life-2026-07-31-[a-z0-9]{4}$/);
  });

  it("uses the first caption line as the excerpt", () => {
    const post = buildLifePost([image()], "第一行\n第二行", now);
    expect(post.excerptZh).toBe("第一行");
  });

  it("falls back to the title as the excerpt when the caption is empty", () => {
    const post = buildLifePost([image()], "", now);
    expect(post.excerptZh).toBe(post.titleZh);
  });

  it("truncates a very long first caption line in the excerpt", () => {
    const longLine = "好".repeat(200);
    const post = buildLifePost([image()], longLine, now);
    expect(post.excerptZh.length).toBeLessThanOrEqual(81);
  });

  it("puts media embed lines before the caption in the body", () => {
    const post = buildLifePost([image(), video()], "今天吃了海鲜饭", now);
    expect(post.bodyZh).toBe(
      "![](/media/2026/07/a.webp)\n![](/media/2026/07/b.mp4?poster=/media/2026/07/b-cover.webp)\n\n今天吃了海鲜饭",
    );
  });

  it("keeps a multiline caption verbatim in the body", () => {
    const post = buildLifePost([image()], "一行\n\n二行", now);
    expect(post.bodyZh).toBe("![](/media/2026/07/a.webp)\n\n一行\n\n二行");
  });

  it("omits the caption block when the caption is empty", () => {
    const post = buildLifePost([image()], "", now);
    expect(post.bodyZh).toBe("![](/media/2026/07/a.webp)");
  });

  it("uses the first image as the cover", () => {
    const post = buildLifePost([image(), video()], "", now);
    expect(post.coverImagePath).toBe("uploads/2026/07/a.webp");
  });

  it("uses the video cover frame as the cover when the video is first", () => {
    const post = buildLifePost([video(), image()], "", now);
    expect(post.coverImagePath).toBe("uploads/2026/07/b-cover.webp");
  });

  it("falls back to the video file itself when no cover frame exists", () => {
    const post = buildLifePost([video({ coverRelativePath: undefined })], "", now);
    expect(post.coverImagePath).toBe("uploads/2026/07/b.mp4");
  });

  it("embeds a video without a poster param when no cover frame exists", () => {
    const post = buildLifePost([video({ coverPublicPath: undefined })], "", now);
    expect(post.bodyZh).toBe("![](/media/2026/07/b.mp4)");
  });
});
