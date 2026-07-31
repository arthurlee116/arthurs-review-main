export type LifeMedia = { url: string; poster?: string; isVideo: boolean };

const EMBED_LINE = /^!\[[^\]]*\]\(([^)\s]+)\)$/;

function parseEmbedLine(line: string): LifeMedia | null {
  const match = line.trim().match(EMBED_LINE);
  if (!match) return null;
  const [url, poster] = match[1].split("?poster=");
  return { url, poster: poster || undefined, isVideo: /\.mp4$/i.test(url) };
}

export function parseLifeBody(body: string): { media: LifeMedia[]; caption: string[] } {
  const media: LifeMedia[] = [];
  const caption: string[] = [];
  let inMediaBlock = true;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const embed = parseEmbedLine(line);
    if (embed && inMediaBlock) {
      media.push(embed);
    } else {
      inMediaBlock = false;
      caption.push(line);
    }
  }
  return { media, caption };
}
