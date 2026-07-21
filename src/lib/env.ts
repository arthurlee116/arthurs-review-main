import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  DATA_DIR: z.string().min(1).default("./data"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  SESSION_SECRET: z.string().min(32),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
});
const DataEnvSchema = EnvSchema.pick({ DATA_DIR: true });

export type AppEnv = z.infer<typeof EnvSchema>;

const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

export function getEnv() {
  return EnvSchema.parse(process.env);
}

export function getReleaseMetadata() {
  const commit = process.env.BUILD_COMMIT_SHA?.trim() || "development";
  const expectedCommit = process.env.DEPLOY_COMMIT_SHA?.trim();
  const digest = process.env.IMAGE_DIGEST?.trim() || "development";
  const configured = Boolean(process.env.BUILD_COMMIT_SHA || expectedCommit || process.env.IMAGE_DIGEST);
  const valid = !configured && process.env.NODE_ENV !== "production"
    ? true
    : commitPattern.test(commit) && expectedCommit === commit && digestPattern.test(digest);
  return { commit, digest, valid };
}

export function getDataPaths() {
  const env = DataEnvSchema.parse(process.env);
  const root = path.resolve(env.DATA_DIR);
  return {
    root,
    dbPath: path.join(root, "arthurs-review.sqlite3"),
    markdownDir: path.join(root, "markdown"),
    uploadsDir: path.join(root, "uploads"),
    backupsDir: path.join(root, "backups"),
    proofsDir: path.join(root, "proofs"),
  };
}

export function ensureDataDirectories() {
  const paths = getDataPaths();
  for (const dir of [paths.root, paths.markdownDir, paths.uploadsDir, paths.backupsDir, paths.proofsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
