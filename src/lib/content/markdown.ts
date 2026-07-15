import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDataDirectories, getDataPaths } from "@/lib/env";

type Language = "zh" | "en";

export function writeMarkdownBody(articleId: number, language: Language, content: string) {
  const paths = ensureDataDirectories();
  const digest = createHash("sha256").update(content, "utf8").digest("hex");
  const fileName = `${articleId}.${language}.${digest}.md`;
  const fullPath = path.join(paths.markdownDir, fileName);
  if (!fs.existsSync(fullPath)) {
    const temporaryPath = path.join(paths.markdownDir, `.${fileName}.${process.pid}.${randomUUID()}.tmp`);
    const file = fs.openSync(temporaryPath, "wx");
    try {
      fs.writeFileSync(file, content, "utf8");
      fs.fsyncSync(file);
    } finally {
      fs.closeSync(file);
    }
    try {
      fs.renameSync(temporaryPath, fullPath);
      const directory = fs.openSync(paths.markdownDir, "r");
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }
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
