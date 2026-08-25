export type UploadedMedia = {
  kind: "image" | "video";
  publicPath: string;
  coverPublicPath?: string;
  relativePath: string;
  coverRelativePath?: string;
};

export type LifePostPayload = {
  titleZh: string;
  slug: string;
  excerptZh: string;
  bodyZh: string;
  coverImagePath: string;
};

const EXCERPT_MAX = 80;
const SLUG_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function slugSuffix() {
  return Array.from({ length: 4 }, () =>
    SLUG_SUFFIX_ALPHABET[Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)],
  ).join("");
}

function mediaEmbedLine(media: UploadedMedia) {
  if (media.kind === "video" && media.coverPublicPath) {
    return `![](${media.publicPath}?poster=${media.coverPublicPath})`;
  }
  return `![](${media.publicPath})`;
}

export function buildLifePost(media: UploadedMedia[], caption: string, now: Date): LifePostPayload {
  const first = media[0];
  if (!first) throw new Error("Life post requires at least one media item.");

  const titleZh = new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(now);
  const slug = `life-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${slugSuffix()}`;

  const trimmedCaption = caption.trim();
  const firstLine = trimmedCaption.split("\n", 1)[0]?.trim() ?? "";
  const excerptZh = firstLine ? firstLine.slice(0, EXCERPT_MAX) : titleZh;

  const mediaBlock = media.map(mediaEmbedLine).join("\n");
  const bodyZh = trimmedCaption ? `${mediaBlock}\n\n${trimmedCaption}` : mediaBlock;

  const coverImagePath = first.kind === "video" ? (first.coverRelativePath ?? first.relativePath) : first.relativePath;

  return { titleZh, slug, excerptZh, bodyZh, coverImagePath };
}
