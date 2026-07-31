import { describe, expect, it } from "vitest";
import { parseLifeBody } from "@/lib/content/life-body";

describe("parseLifeBody", () => {
  it("splits a leading media block from the caption", () => {
    const result = parseLifeBody("![](/media/a.webp)\n![](/media/b.webp)\n\n今天吃了海鲜饭");
    expect(result.media).toEqual([
      { url: "/media/a.webp", poster: undefined, isVideo: false },
      { url: "/media/b.webp", poster: undefined, isVideo: false },
    ]);
    expect(result.caption).toEqual(["今天吃了海鲜饭"]);
  });

  it("extracts the poster and detects video for mp4 embeds", () => {
    const result = parseLifeBody("![](/media/b.mp4?poster=/media/b-cover.webp)");
    expect(result.media).toEqual([{ url: "/media/b.mp4", poster: "/media/b-cover.webp", isVideo: true }]);
  });

  it("keeps multiline captions as paragraphs", () => {
    const result = parseLifeBody("![](/media/a.webp)\n\n一行\n\n二行");
    expect(result.caption).toEqual(["一行", "二行"]);
  });

  it("handles a media-only body", () => {
    const result = parseLifeBody("![](/media/a.webp)");
    expect(result.media).toHaveLength(1);
    expect(result.caption).toEqual([]);
  });

  it("handles a caption-only body", () => {
    const result = parseLifeBody("只有文字");
    expect(result.media).toEqual([]);
    expect(result.caption).toEqual(["只有文字"]);
  });

  it("treats image lines after the caption as caption text, not media", () => {
    const result = parseLifeBody("![](/media/a.webp)\n\n文字\n![](/media/late.webp)");
    expect(result.media).toHaveLength(1);
    expect(result.caption).toEqual(["文字", "![](/media/late.webp)"]);
  });

  it("ignores blank lines inside the media block", () => {
    const result = parseLifeBody("![](/media/a.webp)\n\n![](/media/b.webp)\n\n文字");
    expect(result.media).toHaveLength(2);
    expect(result.caption).toEqual(["文字"]);
  });
});
