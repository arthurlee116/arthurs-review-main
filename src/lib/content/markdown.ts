import fs from "node:fs";
import path from "node:path";
import { ensureDataDirectories, getDataPaths } from "@/lib/env";

type Language = "zh" | "en";

export function writeMarkdownBody(articleId: number, language: Language, content: string) {
  const paths = ensureDataDirectories();
  const fileName = `${articleId}.${language}.md`;
  const fullPath = path.join(paths.markdownDir, fileName);
  fs.writeFileSync(fullPath, content, "utf8");
  return path.posix.join("markdown", fileName);
}

export function readMarkdownBody(relativePath: string) {
  const paths = getDataPaths();
  const fullPath = safeDataPath(paths.root, relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

export function deleteMarkdownBody(relativePath: string | null | undefined) {
  if (!relativePath) return;
  fs.rmSync(safeDataPath(getDataPaths().root, relativePath), { force: true });
}

export function safeDataPath(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error("Path escapes DATA_DIR.");
  }
  return resolved;
}
