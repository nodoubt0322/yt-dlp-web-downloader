import { createHash } from "node:crypto";
import { createId } from "./id.js";
import type { JobStore } from "./jobStore.js";
import type { DownloadTokenRecord, JobRecord } from "./types.js";

interface CreateTokenServiceOptions {
  store: JobStore;
  now?: () => Date;
}

export interface TokenValidationResult {
  token: DownloadTokenRecord;
  job: JobRecord;
}

export function createTokenService(options: CreateTokenServiceOptions) {
  const now = options.now ?? (() => new Date());

  return {
    createToken(jobId: string, expiresAt: Date): string {
      const job = options.store.getJob(jobId);
      if (!job || job.status !== "completed") {
        throw new Error("Download tokens can only be created for completed jobs");
      }

      const token = createId("dl");
      options.store.createDownloadToken({
        tokenHash: hashDownloadToken(token),
        jobId,
        expiresAt
      });
      return token;
    },

    validateToken(token: string): TokenValidationResult | null {
      if (!/^dl_[A-Za-z0-9_-]+$/.test(token)) {
        return null;
      }

      const record = options.store.getDownloadTokenByHash(hashDownloadToken(token));
      if (!record || Date.parse(record.expiresAt) <= now().getTime()) {
        return null;
      }

      const job = options.store.getJob(record.jobId);
      if (!job || job.status !== "completed" || Date.parse(job.expiresAt) <= now().getTime()) {
        return null;
      }

      return { token: record, job };
    }
  };
}

export function hashDownloadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
