import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createId } from "./id.js";
import type {
  AnalysisRecord,
  DownloadTokenRecord,
  JobProgress,
  JobRecord,
  JobResult,
  JobStatus,
  NormalizedJobError
} from "./types.js";

interface CreateJobStoreOptions {
  dbPath: string;
  now?: () => Date;
}

interface CreateAnalysisInput {
  id?: string;
  url: string;
  metadata: Record<string, unknown>;
  expiresAt: Date;
}

interface CreateJobInput {
  analysisId?: string;
  url: string;
  normalizedUrl?: string;
  title?: string;
  extractor?: string;
  options: Record<string, unknown>;
  expiresAt: Date;
}

interface UpdateStatusOptions {
  startedAt?: Date;
}

export interface JobStore {
  createAnalysis(input: CreateAnalysisInput): AnalysisRecord;
  getAnalysis(id: string): AnalysisRecord | null;
  createJob(input: CreateJobInput): JobRecord;
  getJob(id: string): JobRecord | null;
  listQueuedJobs(): JobRecord[];
  listExpiredTerminalJobs(now: Date): JobRecord[];
  updateJobStatus(id: string, status: JobStatus, options?: UpdateStatusOptions): JobRecord;
  updateJobProgress(id: string, progress: JobProgress): JobRecord;
  completeJob(id: string, result: JobResult, completedAt?: Date): JobRecord;
  failJob(id: string, error: NormalizedJobError, completedAt?: Date): JobRecord;
  expireJob(id: string): JobRecord;
  createDownloadToken(input: { tokenHash: string; jobId: string; expiresAt: Date }): DownloadTokenRecord;
  getDownloadTokenByHash(tokenHash: string): DownloadTokenRecord | null;
  markDownloadTokenUsed(tokenHash: string, usedAt?: Date): DownloadTokenRecord;
  close(): void;
}

const allowedTransitions: Record<JobStatus, JobStatus[]> = {
  queued: ["running", "canceled"],
  running: ["completed", "failed", "canceled"],
  completed: ["expired"],
  failed: ["expired"],
  canceled: ["expired"],
  expired: []
};

export function createJobStore(options: CreateJobStoreOptions): JobStore {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  const now = () => (options.now ?? (() => new Date()))().toISOString();

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      analysis_id TEXT REFERENCES analyses(id),
      url TEXT NOT NULL,
      normalized_url TEXT,
      title TEXT,
      extractor TEXT,
      status TEXT NOT NULL,
      options_json TEXT NOT NULL,
      progress_json TEXT,
      result_json TEXT,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS download_tokens (
      token_hash TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
    CREATE INDEX IF NOT EXISTS idx_download_tokens_job_id ON download_tokens(job_id);
  `);

  return {
    createAnalysis(input) {
      const createdAt = now();
      const record: AnalysisRecord = {
        id: input.id ?? createId("ana"),
        url: input.url,
        metadata: input.metadata,
        createdAt,
        expiresAt: input.expiresAt.toISOString()
      };

      db.prepare(
        `INSERT INTO analyses (id, url, metadata_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(record.id, record.url, JSON.stringify(record.metadata), record.createdAt, record.expiresAt);

      return record;
    },

    getAnalysis(id) {
      return mapAnalysis(db.prepare("SELECT * FROM analyses WHERE id = ?").get(id));
    },

    createJob(input) {
      const createdAt = now();
      const record: JobRecord = {
        id: createId("job"),
        analysisId: input.analysisId ?? null,
        url: input.url,
        normalizedUrl: input.normalizedUrl ?? null,
        title: input.title ?? null,
        extractor: input.extractor ?? null,
        status: "queued",
        options: input.options,
        progress: null,
        result: null,
        error: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: null,
        completedAt: null,
        expiresAt: input.expiresAt.toISOString()
      };

      db.prepare(
        `INSERT INTO jobs (
          id, analysis_id, url, normalized_url, title, extractor, status, options_json,
          progress_json, result_json, error_json, created_at, updated_at, started_at, completed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        record.id,
        record.analysisId,
        record.url,
        record.normalizedUrl,
        record.title,
        record.extractor,
        record.status,
        JSON.stringify(record.options),
        null,
        null,
        null,
        record.createdAt,
        record.updatedAt,
        record.startedAt,
        record.completedAt,
        record.expiresAt
      );

      return record;
    },

    getJob(id) {
      return getJobOrNull(db, id);
    },

    listQueuedJobs() {
      return db
        .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC")
        .all()
        .map(mapJob);
    },

    listExpiredTerminalJobs(referenceTime) {
      return db
        .prepare(
          `SELECT * FROM jobs
           WHERE status IN ('completed', 'failed', 'canceled') AND expires_at <= ?
           ORDER BY expires_at ASC`
        )
        .all(referenceTime.toISOString())
        .map(mapJob);
    },

    updateJobStatus(id, status, updateOptions = {}) {
      const existing = requireJob(db, id);
      assertTransition(existing.status, status);
      const updatedAt = now();

      db.prepare("UPDATE jobs SET status = ?, updated_at = ?, started_at = COALESCE(?, started_at) WHERE id = ?").run(
        status,
        updatedAt,
        updateOptions.startedAt?.toISOString() ?? null,
        id
      );

      return requireJob(db, id);
    },

    updateJobProgress(id, progress) {
      requireJob(db, id);
      db.prepare("UPDATE jobs SET progress_json = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(progress),
        now(),
        id
      );
      return requireJob(db, id);
    },

    completeJob(id, result, completedAt = new Date()) {
      const existing = requireJob(db, id);
      assertTransition(existing.status, "completed");
      const timestamp = completedAt.toISOString();
      db.prepare(
        "UPDATE jobs SET status = 'completed', result_json = ?, error_json = NULL, updated_at = ?, completed_at = ? WHERE id = ?"
      ).run(JSON.stringify(result), now(), timestamp, id);
      return requireJob(db, id);
    },

    failJob(id, error, completedAt = new Date()) {
      const existing = requireJob(db, id);
      assertTransition(existing.status, "failed");
      const timestamp = completedAt.toISOString();
      db.prepare(
        "UPDATE jobs SET status = 'failed', error_json = ?, updated_at = ?, completed_at = ? WHERE id = ?"
      ).run(JSON.stringify(error), now(), timestamp, id);
      return requireJob(db, id);
    },

    expireJob(id) {
      const existing = requireJob(db, id);
      assertTransition(existing.status, "expired");
      db.prepare("UPDATE jobs SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), id);
      return requireJob(db, id);
    },

    createDownloadToken(input) {
      const record: DownloadTokenRecord = {
        tokenHash: input.tokenHash,
        jobId: input.jobId,
        createdAt: now(),
        expiresAt: input.expiresAt.toISOString(),
        usedAt: null
      };

      db.prepare(
        `INSERT INTO download_tokens (token_hash, job_id, created_at, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(record.tokenHash, record.jobId, record.createdAt, record.expiresAt, record.usedAt);

      return record;
    },

    getDownloadTokenByHash(tokenHash) {
      return mapDownloadToken(db.prepare("SELECT * FROM download_tokens WHERE token_hash = ?").get(tokenHash));
    },

    markDownloadTokenUsed(tokenHash, usedAt = new Date()) {
      db.prepare("UPDATE download_tokens SET used_at = ? WHERE token_hash = ?").run(usedAt.toISOString(), tokenHash);
      const record = this.getDownloadTokenByHash(tokenHash);
      if (!record) {
        throw new Error("Download token not found");
      }
      return record;
    },

    close() {
      db.close();
    }
  };
}

function requireJob(db: DatabaseSync, id: string): JobRecord {
  const job = getJobOrNull(db, id);
  if (!job) {
    throw new Error(`Job not found: ${id}`);
  }
  return job;
}

function getJobOrNull(db: DatabaseSync, id: string): JobRecord | null {
  return mapJob(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
}

function assertTransition(from: JobStatus, to: JobStatus) {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid job status transition: ${from} -> ${to}`);
  }
}

function mapAnalysis(row: unknown): AnalysisRecord | null {
  if (!row) return null;
  const value = row as Record<string, string>;
  return {
    id: requireString(value.id, "id"),
    url: requireString(value.url, "url"),
    metadata: JSON.parse(requireString(value.metadata_json, "metadata_json")),
    createdAt: requireString(value.created_at, "created_at"),
    expiresAt: requireString(value.expires_at, "expires_at")
  };
}

function mapJob(row: unknown): JobRecord {
  const value = row as Record<string, string | null>;
  return {
    id: requireString(value.id, "id"),
    analysisId: nullableString(value.analysis_id),
    url: requireString(value.url, "url"),
    normalizedUrl: nullableString(value.normalized_url),
    title: nullableString(value.title),
    extractor: nullableString(value.extractor),
    status: requireString(value.status, "status") as JobStatus,
    options: parseJson(requireString(value.options_json, "options_json")) ?? {},
    progress: parseJson(nullableString(value.progress_json)),
    result: parseJson(nullableString(value.result_json)),
    error: parseJson(nullableString(value.error_json)),
    createdAt: requireString(value.created_at, "created_at"),
    updatedAt: requireString(value.updated_at, "updated_at"),
    startedAt: nullableString(value.started_at),
    completedAt: nullableString(value.completed_at),
    expiresAt: requireString(value.expires_at, "expires_at")
  };
}

function mapDownloadToken(row: unknown): DownloadTokenRecord | null {
  if (!row) return null;
  const value = row as Record<string, string | null>;
  return {
    tokenHash: requireString(value.token_hash, "token_hash"),
    jobId: requireString(value.job_id, "job_id"),
    createdAt: requireString(value.created_at, "created_at"),
    expiresAt: requireString(value.expires_at, "expires_at"),
    usedAt: nullableString(value.used_at)
  };
}

function parseJson<T>(value: string | null): T | null {
  return value ? JSON.parse(value) : null;
}

function requireString(value: string | null | undefined, column: string): string {
  if (value === null || value === undefined) {
    throw new Error(`Missing required column: ${column}`);
  }
  return value;
}

function nullableString(value: string | null | undefined): string | null {
  return value ?? null;
}
