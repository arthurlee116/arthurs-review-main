import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CategoryId } from "@/lib/content/categories";
import type { Article } from "./articles";
import { articlePath } from "@/lib/content/urls";
import { getDb } from "@/lib/db/connection";
import { getDataPaths } from "@/lib/env";
import { pageWindow, type PageResult } from "@/lib/pagination";

const execFileAsync = promisify(execFile);

type ProofStatus = "pending" | "complete" | "failed";

export type PublicationProof = {
  id: number;
  articleId: number;
  createdAt: string;
  publicUrl: string;
  contentFingerprint: string;
  documentSha256: string;
  documentPath: string;
  otsPath: string | null;
  otsStatus: ProofStatus;
  otsError: string | null;
  waybackUrl: string | null;
  waybackStatus: ProofStatus;
  waybackError: string | null;
};

export type PublicPublicationProof = {
  id: number;
  articleId: number;
  articleTitle: string;
  articleSlug: string;
  articleCategory: CategoryId;
  createdAt: string;
  publicUrl: string;
  documentSha256: string;
  otsStatus: ProofStatus;
  otsAvailable: boolean;
  waybackUrl: string | null;
  waybackStatus: ProofStatus;
};

type ProofRow = {
  id: number;
  article_id: number;
  created_at: string;
  public_url: string;
  content_fingerprint: string;
  document_sha256: string;
  document_path: string;
  ots_path: string | null;
  ots_status: ProofStatus;
  ots_error: string | null;
  wayback_url: string | null;
  wayback_status: ProofStatus;
  wayback_error: string | null;
};

type PublicProofRow = ProofRow & {
  article_title: string;
  article_slug: string;
  article_category: CategoryId;
};

export type PublicProofPage = PageResult<PublicPublicationProof> & {
  totalArticles: number;
  totalProofs: number;
  completeServices: number;
  pendingServices: number;
  failedServices: number;
};

type ProofServices = {
  now: () => Date;
  stamp: (documentPath: string) => Promise<Uint8Array>;
  capture: (url: string) => Promise<string>;
};

type ProofRuntime = {
  runs: Map<string, Promise<PublicationProof | null>>;
  waybackRetries: Map<string, ReturnType<typeof setTimeout>>;
};

const globalRuntime = globalThis as typeof globalThis & { __arthursReviewProofRuntime?: ProofRuntime };
const proofRuntime = (globalRuntime.__arthursReviewProofRuntime ??= { runs: new Map(), waybackRetries: new Map() });
const WAYBACK_RETRY_DELAY_MS = 20 * 60 * 1000;

function mapProof(row: ProofRow): PublicationProof {
  return {
    id: row.id,
    articleId: row.article_id,
    createdAt: row.created_at,
    publicUrl: row.public_url,
    contentFingerprint: row.content_fingerprint,
    documentSha256: row.document_sha256,
    documentPath: row.document_path,
    otsPath: row.ots_path,
    otsStatus: row.ots_status,
    otsError: row.ots_error,
    waybackUrl: row.wayback_url,
    waybackStatus: row.wayback_status,
    waybackError: row.wayback_error,
  };
}

function mapPublicProof(row: PublicProofRow): PublicPublicationProof {
  return {
    id: row.id,
    articleId: row.article_id,
    articleTitle: row.article_title,
    articleSlug: row.article_slug,
    articleCategory: row.article_category,
    createdAt: row.created_at,
    publicUrl: row.public_url,
    documentSha256: row.document_sha256,
    otsStatus: row.ots_status,
    otsAvailable: row.ots_status === "complete" && row.ots_path !== null,
    waybackUrl: row.wayback_url,
    waybackStatus: row.wayback_status,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function articleContent(article: Article) {
  return {
    titleZh: article.titleZh,
    titleEn: article.titleEn,
    slug: article.slug,
    category: article.category,
    excerptZh: article.excerptZh,
    excerptEn: article.excerptEn,
    seoDescription: article.seoDescription,
    bodyZh: article.bodyZh ?? "",
    bodyEn: article.bodyEn ?? null,
    coverImagePath: article.coverImagePath,
    tags: article.tags.map(({ name, slug }) => ({ name, slug })),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function stampWithOpenTimestamps(documentPath: string) {
  const executable = process.env.OTS_CLI_PATH ?? "ots";
  if (fs.existsSync(`${documentPath}.ots`)) {
    return new Uint8Array(fs.readFileSync(`${documentPath}.ots`));
  }
  await execFileAsync(executable, ["stamp", documentPath], { timeout: 60_000 });
  return new Uint8Array(fs.readFileSync(`${documentPath}.ots`));
}

async function waybackRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Wayback returned HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

export async function captureWithWayback(publicUrl: string) {
  const accessKey = process.env.WAYBACK_ACCESS_KEY;
  const secretKey = process.env.WAYBACK_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("Wayback credentials are not configured");
  const authorization = `LOW ${accessKey}:${secretKey}`;
  const submitted = await retry(() =>
    waybackRequest("https://web.archive.org/save", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        url: publicUrl,
        capture_all: "1",
        if_not_archived_within: "0",
        skip_first_archive: "1",
        js_behavior_timeout: "0",
      }),
    }),
  );
  const jobId = typeof submitted.job_id === "string" ? submitted.job_id : null;
  if (!jobId) throw new Error("Wayback did not return a job id");

  const pollAttempts = Number.parseInt(process.env.WAYBACK_POLL_ATTEMPTS ?? "40", 10);
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const result = await retry(() =>
      waybackRequest(`https://web.archive.org/save/status/${encodeURIComponent(jobId)}?_t=${Date.now()}`, {
        headers: { accept: "application/json", authorization },
      }),
    );
    if (result.status === "success" && typeof result.timestamp === "string") {
      return `https://web.archive.org/web/${result.timestamp}/${publicUrl}`;
    }
    if (result.status === "error") throw new Error(typeof result.message === "string" ? result.message : "Wayback capture failed");
    await sleep(3000);
  }
  throw new Error("Wayback capture timed out");
}

const defaultServices: ProofServices = {
  now: () => new Date(),
  stamp: stampWithOpenTimestamps,
  capture: captureWithWayback,
};

export function getPublicationProof(id: number) {
  const row = getDb().prepare("select * from publication_proofs where id = ?").get(id) as ProofRow | undefined;
  return row ? mapProof(row) : null;
}

export function listPublicationProofs(articleId: number) {
  return (getDb()
    .prepare("select * from publication_proofs where article_id = ? order by created_at desc, id desc")
    .all(articleId) as ProofRow[]).map(mapProof);
}

export function listPublicPublicationProofs(): PublicPublicationProof[] {
  const rows = getDb()
    .prepare(
      `select publication_proofs.*,
              revisions.title_zh as article_title,
              revisions.slug as article_slug,
              revisions.category as article_category
       from publication_proofs
       join articles on articles.id = publication_proofs.article_id
       join article_revisions as revisions on revisions.id = articles.published_revision_id
       order by publication_proofs.created_at desc, publication_proofs.id desc`,
    )
    .all() as PublicProofRow[];

  return rows.map(mapPublicProof);
}

export function listPublicPublicationProofPage({ page, pageSize = 50 }: { page?: number; pageSize?: number } = {}): PublicProofPage {
  const db = getDb();
  const totals = db
    .prepare(
      `select count(*) as total,
              count(distinct publication_proofs.article_id) as total_articles,
              coalesce(sum((publication_proofs.ots_status = 'complete') + (publication_proofs.wayback_status = 'complete')), 0) as complete_services,
              coalesce(sum((publication_proofs.ots_status = 'pending') + (publication_proofs.wayback_status = 'pending')), 0) as pending_services,
              coalesce(sum((publication_proofs.ots_status = 'failed') + (publication_proofs.wayback_status = 'failed')), 0) as failed_services
       from publication_proofs
       join articles on articles.id = publication_proofs.article_id
       where articles.published_revision_id is not null`,
    )
    .get() as {
      total: number;
      total_articles: number;
      complete_services: number;
      pending_services: number;
      failed_services: number;
    };
  const window = pageWindow(totals.total_articles, page, pageSize);
  const { offset, ...pageInfo } = window;
  const articleIds = (
    db
      .prepare(
        `select publication_proofs.article_id
         from publication_proofs
         join articles on articles.id = publication_proofs.article_id
         where articles.published_revision_id is not null
         group by publication_proofs.article_id
         order by max(publication_proofs.created_at) desc, publication_proofs.article_id desc
         limit ? offset ?`,
      )
      .all(window.pageSize, offset) as Array<{ article_id: number }>
  ).map((row) => row.article_id);

  const rows = articleIds.length
    ? (db
        .prepare(
          `select publication_proofs.*,
                  revisions.title_zh as article_title,
                  revisions.slug as article_slug,
                  revisions.category as article_category
           from publication_proofs
           join articles on articles.id = publication_proofs.article_id
           join article_revisions as revisions on revisions.id = articles.published_revision_id
           where publication_proofs.article_id in (${articleIds.map(() => "?").join(", ")})
           order by publication_proofs.created_at desc, publication_proofs.id desc`,
        )
        .all(...articleIds) as PublicProofRow[])
    : [];

  return {
    ...pageInfo,
    items: rows.map(mapPublicProof),
    totalArticles: totals.total_articles,
    totalProofs: totals.total,
    completeServices: totals.complete_services,
    pendingServices: totals.pending_services,
    failedServices: totals.failed_services,
  };
}

export function resolveProofPath(relativePath: string) {
  const root = path.resolve(getDataPaths().root);
  const fullPath = path.resolve(root, relativePath);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error("Proof path escapes DATA_DIR");
  return fullPath;
}

async function finishPublicationProof(proof: PublicationProof, services: ProofServices) {
  const needsOts = proof.otsStatus !== "complete";
  const needsWayback = proof.waybackStatus !== "complete";
  if (!needsOts && !needsWayback) return proof;

  const fullDocumentPath = resolveProofPath(proof.documentPath);
  const otsPath = `${proof.documentPath}.ots`;
  const [otsResult, waybackResult] = await Promise.allSettled([
    needsOts ? services.stamp(fullDocumentPath) : null,
    needsWayback ? services.capture(proof.publicUrl) : null,
  ]);

  if (needsOts) {
    if (otsResult.status === "fulfilled" && otsResult.value) {
      fs.writeFileSync(resolveProofPath(otsPath), otsResult.value);
      getDb()
        .prepare("update publication_proofs set ots_path = ?, ots_status = 'complete', ots_error = null where id = ?")
        .run(otsPath, proof.id);
    } else if (otsResult.status === "rejected") {
      getDb()
        .prepare("update publication_proofs set ots_status = 'failed', ots_error = ? where id = ?")
        .run(errorMessage(otsResult.reason), proof.id);
    }
  }

  if (needsWayback) {
    if (waybackResult.status === "fulfilled" && waybackResult.value) {
      getDb()
        .prepare("update publication_proofs set wayback_url = ?, wayback_status = 'complete', wayback_error = null where id = ?")
        .run(waybackResult.value, proof.id);
    } else if (waybackResult.status === "rejected") {
      getDb()
        .prepare("update publication_proofs set wayback_status = 'failed', wayback_error = ? where id = ?")
        .run(errorMessage(waybackResult.reason), proof.id);
    }
  }

  return getPublicationProof(proof.id);
}

function finishPublicationProofOnce(proof: PublicationProof, services: ProofServices, scheduleWaybackRetry = true) {
  const key = resolveProofPath(proof.documentPath);
  const existing = proofRuntime.runs.get(key);
  if (existing) return existing;

  const run = finishPublicationProof(proof, services)
    .then((result) => {
      if (result?.waybackStatus === "complete") {
        const timer = proofRuntime.waybackRetries.get(key);
        if (timer) clearTimeout(timer);
        proofRuntime.waybackRetries.delete(key);
      } else if (scheduleWaybackRetry && result?.waybackStatus === "failed" && !proofRuntime.waybackRetries.has(key)) {
        // ponytail: in-process timer; persist retry jobs if this app ever runs multiple replicas.
        const timer = setTimeout(() => {
          proofRuntime.waybackRetries.delete(key);
          const current = getPublicationProof(proof.id);
          if (!current || current.waybackStatus === "complete") return;
          void finishPublicationProofOnce(current, services, false).catch((error: unknown) => {
            console.error("Wayback retry failed", error);
          });
        }, WAYBACK_RETRY_DELAY_MS);
        timer.unref();
        proofRuntime.waybackRetries.set(key, timer);
      }
      return result;
    })
    .finally(() => {
      proofRuntime.runs.delete(key);
    });
  proofRuntime.runs.set(key, run);
  return run;
}

export async function createPublicationProof(article: Article, services: ProofServices = defaultServices) {
  if (article.status !== "published") return null;
  const content = articleContent(article);
  const contentFingerprint = sha256(JSON.stringify(content));
  const duplicate = getDb()
    .prepare("select * from publication_proofs where article_id = ? and content_fingerprint = ?")
    .get(article.id, contentFingerprint) as ProofRow | undefined;
  if (duplicate) return finishPublicationProofOnce(mapProof(duplicate), services);

  const createdAt = services.now().toISOString();
  const publicUrl = new URL(articlePath(article.category, article.slug), process.env.SITE_URL ?? "http://localhost:3000").toString();
  const document = `${JSON.stringify(
    {
      format: "arthurs-review-publication-proof/v1",
      createdAt,
      publicUrl,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
      article: content,
    },
    null,
    2,
  )}\n`;
  const documentSha256 = sha256(document);
  const relativeDir = path.join("proofs", String(article.id));
  const documentPath = path.join(relativeDir, `${createdAt.replaceAll(":", "-")}-${documentSha256}.json`);
  const fullDocumentPath = resolveProofPath(documentPath);
  fs.mkdirSync(path.dirname(fullDocumentPath), { recursive: true });
  fs.writeFileSync(fullDocumentPath, document, { encoding: "utf8", flag: "wx" });

  const result = getDb()
    .prepare(
      `insert into publication_proofs
       (article_id, created_at, public_url, content_fingerprint, document_sha256, document_path, ots_status, wayback_status)
       values (?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
    )
    .run(article.id, createdAt, publicUrl, contentFingerprint, documentSha256, documentPath);
  const id = Number(result.lastInsertRowid);
  return finishPublicationProofOnce(getPublicationProof(id)!, services);
}
