import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CategoryId } from "@/lib/content/categories";
import type { Article } from "./articles";
import { safeDataPath } from "@/lib/content/markdown";
import { articlePath } from "@/lib/content/urls";
import { getDb } from "@/lib/db/connection";
import { getDataPaths } from "@/lib/env";
import { errorMessage, NotFoundError } from "@/lib/errors";
import { pageWindow, type PageResult } from "@/lib/pagination";

const execFileAsync = promisify(execFile);

export type OpenTimestampStatus = "submitted" | "pending_confirmation" | "anchored" | "verification_failed";
type WaybackStatus = "pending" | "complete" | "failed";

export type PublicationProof = {
  id: number;
  articleId: number;
  articleRevisionId: number | null;
  createdAt: string;
  publicUrl: string;
  contentFingerprint: string;
  documentSha256: string;
  documentPath: string;
  otsPath: string | null;
  otsStatus: OpenTimestampStatus;
  otsError: string | null;
  waybackUrl: string | null;
  waybackStatus: WaybackStatus;
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
  otsStatus: OpenTimestampStatus;
  otsAvailable: boolean;
  waybackUrl: string | null;
  waybackStatus: WaybackStatus;
};

type ProofRow = {
  id: number;
  article_id: number;
  article_revision_id: number | null;
  created_at: string;
  public_url: string;
  content_fingerprint: string;
  document_sha256: string;
  document_path: string;
  ots_path: string | null;
  ots_status: OpenTimestampStatus;
  ots_error: string | null;
  wayback_url: string | null;
  wayback_status: WaybackStatus;
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

export type ProofServices = {
  now: () => Date;
  stamp: (documentPath: string) => Promise<Uint8Array>;
  upgrade?: (otsPath: string) => Promise<"complete" | "pending_confirmation">;
  verify?: (documentPath: string, otsPath: string) => Promise<"anchored" | "pending_confirmation">;
  capture: (url: string) => Promise<string>;
};

function mapProof(row: ProofRow): PublicationProof {
  return {
    id: row.id,
    articleId: row.article_id,
    articleRevisionId: row.article_revision_id,
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
    otsAvailable: row.ots_path !== null,
    waybackUrl: row.wayback_url,
    waybackStatus: row.wayback_status,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256File(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function atomicWriteBytes(filePath: string, value: Uint8Array) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const file = fs.openSync(temporaryPath, "wx");
  try {
    fs.writeFileSync(file, value);
    fs.fsyncSync(file);
  } finally {
    fs.closeSync(file);
  }
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function writeImmutableText(filePath: string, value: string) {
  try {
    fs.writeFileSync(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (fs.readFileSync(filePath, "utf8") !== value) {
      throw new Error("Existing publication proof source does not match the queued revision.");
    }
  }
}

function commandText(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const output = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
  return [error.message, output.stdout?.toString(), output.stderr?.toString()].filter(Boolean).join("\n");
}

function isPendingConfirmation(error: unknown) {
  return /pending confirmation|timestamp not complete|commitment not found/i.test(commandText(error));
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
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(documentPath), ".ots-stamp-"));
  const temporaryDocument = path.join(temporaryDirectory, path.basename(documentPath));
  try {
    fs.copyFileSync(documentPath, temporaryDocument);
    await execFileAsync(executable, ["stamp", temporaryDocument], { timeout: 60_000 });
    const receiptPath = `${temporaryDocument}.ots`;
    const receipt = new Uint8Array(fs.readFileSync(receiptPath));
    if (receipt.byteLength === 0) throw new Error("OpenTimestamps produced an empty receipt.");
    return receipt;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function upgradeOpenTimestamps(otsPath: string): Promise<"complete" | "pending_confirmation"> {
  const executable = process.env.OTS_CLI_PATH ?? "ots";
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(otsPath), ".ots-upgrade-"));
  const temporaryReceipt = path.join(temporaryDirectory, path.basename(otsPath));
  try {
    fs.copyFileSync(otsPath, temporaryReceipt);
    try {
      await execFileAsync(executable, ["upgrade", temporaryReceipt], { timeout: 60_000 });
    } catch (error) {
      if (!isPendingConfirmation(error)) throw error;
      const updated = new Uint8Array(fs.readFileSync(temporaryReceipt));
      if (updated.byteLength > 0) atomicWriteBytes(otsPath, updated);
      return "pending_confirmation";
    }
    const upgraded = new Uint8Array(fs.readFileSync(temporaryReceipt));
    if (upgraded.byteLength === 0) throw new Error("OpenTimestamps upgrade produced an empty receipt.");
    atomicWriteBytes(otsPath, upgraded);
    return "complete";
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function verifyOpenTimestamps(documentPath: string, otsPath: string): Promise<"anchored" | "pending_confirmation"> {
  const executable = process.env.OTS_CLI_PATH ?? "ots";
  try {
    await execFileAsync(executable, ["verify", "-f", documentPath, otsPath], { timeout: 60_000 });
    return "anchored";
  } catch (error) {
    if (isPendingConfirmation(error)) return "pending_confirmation";
    if (!/could not connect to bitcoin node/i.test(commandText(error))) throw error;
  }
  // This ots build only verifies Bitcoin attestations against a local node,
  // which the container doesn't run. Fall back to checking each attested
  // block's merkle root against public esplora endpoints.
  return verifyAgainstEsplora(executable, documentPath, otsPath);
}

function parseAttestations(noBitcoinOutput: string) {
  const attestations: Array<{ height: number; merkleRoot: string }> = [];
  for (const match of noBitcoinOutput.matchAll(/Bitcoin block (\d+) has merkleroot ([0-9a-f]{64})/g)) {
    attestations.push({ height: Number(match[1]), merkleRoot: match[2]! });
  }
  return attestations;
}

async function fetchEsploraMerkleRoot(height: number): Promise<string> {
  const endpoints = (process.env.OTS_ESPLORA_URLS ?? "https://mempool.space/api,https://blockstream.info/api").split(",");
  let lastError: unknown;
  for (const base of endpoints) {
    try {
      const hashResponse = await fetch(`${base.trim()}/block-height/${height}`, { signal: AbortSignal.timeout(15_000) });
      if (!hashResponse.ok) throw new Error(`HTTP ${hashResponse.status}`);
      const blockHash = (await hashResponse.text()).trim();
      const blockResponse = await fetch(`${base.trim()}/block/${blockHash}`, { signal: AbortSignal.timeout(15_000) });
      if (!blockResponse.ok) throw new Error(`HTTP ${blockResponse.status}`);
      const block = (await blockResponse.json()) as { merkle_root?: unknown };
      if (typeof block.merkle_root === "string" && /^[0-9a-f]{64}$/.test(block.merkle_root)) return block.merkle_root;
      throw new Error("missing merkle_root");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function verifyAttestationsAgainstEsplora(
  attestations: Array<{ height: number; merkleRoot: string }>,
  fetchMerkleRoot: (height: number) => Promise<string> = fetchEsploraMerkleRoot,
): Promise<"anchored"> {
  for (const { height, merkleRoot } of attestations) {
    let actual: string;
    try {
      actual = await fetchMerkleRoot(height);
    } catch (error) {
      throw new Error(`Could not fetch Bitcoin block ${height} for verification: ${errorMessage(error)}`);
    }
    if (actual !== merkleRoot) {
      throw new Error(`Bitcoin block ${height} merkle root mismatch: expected ${merkleRoot}, got ${actual}.`);
    }
  }
  return "anchored";
}

// `ots --no-bitcoin verify` reports attestations on stderr and exits non-zero;
// a zero exit would mean it verified something we didn't ask for, so fail closed.
async function runNoBitcoinVerify(executable: string, documentPath: string, otsPath: string) {
  try {
    await execFileAsync(executable, ["--no-bitcoin", "verify", "-f", documentPath, otsPath], { timeout: 60_000 });
  } catch (error) {
    return commandText(error);
  }
  throw new Error("OpenTimestamps --no-bitcoin verify unexpectedly succeeded.");
}

async function verifyAgainstEsplora(executable: string, documentPath: string, otsPath: string): Promise<"anchored" | "pending_confirmation"> {
  const output = await runNoBitcoinVerify(executable, documentPath, otsPath);
  const attestations = parseAttestations(output);
  if (attestations.length === 0) {
    if (isPendingConfirmation(output)) return "pending_confirmation";
    throw new Error(`OpenTimestamps verify produced no attestations: ${output.split("\n")[0] ?? "unknown error"}`);
  }
  return verifyAttestationsAgainstEsplora(attestations);
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

export const __testables = { parseAttestations, fetchEsploraMerkleRoot, verifyAttestationsAgainstEsplora };

const defaultServices: ProofServices = {
  now: () => new Date(),
  stamp: stampWithOpenTimestamps,
  upgrade: upgradeOpenTimestamps,
  verify: verifyOpenTimestamps,
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
              coalesce(sum((publication_proofs.ots_status = 'anchored') + (publication_proofs.wayback_status = 'complete')), 0) as complete_services,
              coalesce(sum((publication_proofs.ots_status in ('submitted', 'pending_confirmation')) + (publication_proofs.wayback_status = 'pending')), 0) as pending_services,
              coalesce(sum((publication_proofs.ots_status = 'verification_failed') + (publication_proofs.wayback_status = 'failed')), 0) as failed_services
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
  return safeDataPath(getDataPaths().root, relativePath);
}

type ProofStateFields = {
  ots_path?: string | null;
  ots_status?: OpenTimestampStatus;
  ots_error?: string | null;
  wayback_url?: string | null;
  wayback_status?: WaybackStatus;
  wayback_error?: string | null;
};

function updateProofState(id: number, fields: ProofStateFields) {
  const entries = Object.entries(fields);
  const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
  getDb()
    .prepare(`update publication_proofs set ${assignments} where id = ?`)
    .run(...entries.map(([, value]) => value), id);
}

async function finishOpenTimestamps(proof: PublicationProof, services: ProofServices) {
  if (proof.otsStatus === "anchored") return;
  const fullDocumentPath = resolveProofPath(proof.documentPath);
  if (sha256File(fullDocumentPath) !== proof.documentSha256) {
    updateProofState(proof.id, { ots_status: "verification_failed", ots_error: "Proof source document hash mismatch." });
    return;
  }

  const relativeOtsPath = proof.otsPath ?? `${proof.documentPath}.ots`;
  const fullOtsPath = resolveProofPath(relativeOtsPath);
  const needsReceipt =
    proof.otsStatus === "submitted" ||
    (proof.otsStatus === "verification_failed" && (!proof.otsPath || !fs.existsSync(fullOtsPath) || fs.statSync(fullOtsPath).size === 0));
  if (needsReceipt) {
    fs.rmSync(fullOtsPath, { force: true });
    try {
      const receipt = await services.stamp(fullDocumentPath);
      if (receipt.byteLength === 0) throw new Error("OpenTimestamps produced an empty receipt.");
      atomicWriteBytes(fullOtsPath, receipt);
      updateProofState(proof.id, { ots_path: relativeOtsPath, ots_status: "pending_confirmation", ots_error: null });
    } catch (error) {
      fs.rmSync(fullOtsPath, { force: true });
      updateProofState(proof.id, { ots_path: null, ots_status: "verification_failed", ots_error: errorMessage(error) });
      return;
    }
  }

  if (!fs.existsSync(fullOtsPath) || fs.statSync(fullOtsPath).size === 0) {
    if (proof.otsStatus === "verification_failed") return;
    updateProofState(proof.id, {
      ots_path: null,
      ots_status: "verification_failed",
      ots_error: "OpenTimestamps receipt is missing or empty.",
    });
    return;
  }

  try {
    const upgrade = await (services.upgrade ?? (async () => "pending_confirmation" as const))(fullOtsPath);
    if (upgrade === "pending_confirmation") {
      updateProofState(proof.id, { ots_status: "pending_confirmation", ots_error: null });
      return;
    }
    const verification = await (services.verify ?? (async () => "pending_confirmation" as const))(fullDocumentPath, fullOtsPath);
    updateProofState(proof.id, { ots_status: verification, ots_error: null });
  } catch (error) {
    updateProofState(proof.id, { ots_status: "verification_failed", ots_error: errorMessage(error) });
  }
}

export async function advanceOpenTimestampProof(id: number, services: ProofServices = defaultServices) {
  const proof = getPublicationProof(id);
  if (!proof) throw new NotFoundError("Publication proof not found.");
  await finishOpenTimestamps(proof, services);
  return getPublicationProof(id);
}

async function runWaybackCapture(id: number, publicUrl: string, capture: ProofServices["capture"]) {
  try {
    const waybackUrl = await capture(publicUrl);
    updateProofState(id, { wayback_url: waybackUrl, wayback_status: "complete", wayback_error: null });
    return waybackUrl;
  } catch (error) {
    updateProofState(id, { wayback_status: "failed", wayback_error: errorMessage(error) });
    throw error;
  }
}

export async function captureWaybackProof(id: number, capture: ProofServices["capture"] = captureWithWayback) {
  const proof = getPublicationProof(id);
  if (!proof) throw new NotFoundError("Publication proof not found.");
  if (proof.waybackStatus === "complete") return proof;
  await runWaybackCapture(id, proof.publicUrl, capture);
  return getPublicationProof(proof.id);
}

async function finishPublicationProof(proof: PublicationProof, services: ProofServices) {
  const needsOts = proof.otsStatus === "submitted" || proof.otsStatus === "pending_confirmation";
  const needsWayback = proof.waybackStatus !== "complete";
  if (!needsOts && !needsWayback) return proof;

  // Wayback persists its own outcome in runWaybackCapture; OTS failures are marked here.
  const [otsResult] = await Promise.allSettled([
    needsOts ? finishOpenTimestamps(proof, services) : null,
    needsWayback ? runWaybackCapture(proof.id, proof.publicUrl, services.capture) : null,
  ]);

  if (needsOts && otsResult.status === "rejected") {
    updateProofState(proof.id, { ots_status: "verification_failed", ots_error: errorMessage(otsResult.reason) });
  }

  return getPublicationProof(proof.id);
}

export function ensurePublicationProofRecord(article: Article, { createdAt = new Date().toISOString() }: { createdAt?: string } = {}) {
  if (article.status !== "published") return null;
  const content = articleContent(article);
  const contentFingerprint = sha256(JSON.stringify(content));
  const duplicate = getDb()
    .prepare("select * from publication_proofs where article_id = ? and content_fingerprint = ?")
    .get(article.id, contentFingerprint) as ProofRow | undefined;
  if (duplicate) return mapProof(duplicate);

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
  writeImmutableText(fullDocumentPath, document);

  getDb()
    .prepare(
      `insert into publication_proofs
       (article_id, article_revision_id, created_at, public_url, content_fingerprint, document_sha256, document_path, ots_status, wayback_status)
       values (?, ?, ?, ?, ?, ?, ?, 'submitted', 'pending')
       on conflict(article_id, content_fingerprint) do nothing`,
    )
    .run(article.id, article.revisionId, createdAt, publicUrl, contentFingerprint, documentSha256, documentPath);
  const stored = getDb()
    .prepare("select * from publication_proofs where article_id = ? and content_fingerprint = ?")
    .get(article.id, contentFingerprint) as ProofRow | undefined;
  if (!stored) throw new Error("Publication proof record was not stored.");
  return mapProof(stored);
}

export async function createPublicationProof(article: Article, services: ProofServices = defaultServices) {
  const proof = ensurePublicationProofRecord(article, { createdAt: services.now().toISOString() });
  return proof ? finishPublicationProof(proof, services) : null;
}
