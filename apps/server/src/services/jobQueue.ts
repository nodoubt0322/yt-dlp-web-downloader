import { join } from "node:path";
import { buildDownloadArgs } from "./commandBuilder.js";
import { normalizeYtDlpError } from "./errors.js";
import type { JobStore } from "./jobStore.js";
import { ProcessRunnerError, runProcessStreaming } from "./processRunner.js";
import { parseProgressLine } from "./progressParser.js";
import { createStorageService } from "./storageService.js";
import { createTokenService } from "./tokenService.js";

export interface CreateJobQueueOptions {
  store: JobStore;
  dataDir: string;
  ytDlpBinary: string;
  timeoutMs: number;
  publicBaseUrl?: string;
  fileTtlMinutes: number;
  now?: () => Date;
}

export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
}

export function createJobQueue(options: CreateJobQueueOptions): JobQueue {
  const storage = createStorageService({ dataDir: options.dataDir });
  const tokenService = createTokenService({ store: options.store, now: options.now });
  const now = options.now ?? (() => new Date());
  let tail = Promise.resolve();

  return {
    enqueue(jobId) {
      const run = tail.then(() => runJob(jobId));
      tail = run.catch(() => undefined);
      return run;
    }
  };

  async function runJob(jobId: string) {
    const job = options.store.getJob(jobId);
    if (!job || job.status !== "queued") {
      return;
    }

    try {
      const jobDir = await storage.createJobDirectory(job.id);
      const tempDir = join(jobDir, ".tmp");
      options.store.updateJobStatus(job.id, "running", { startedAt: now() });

      await runProcessStreaming(
        options.ytDlpBinary,
        buildDownloadArgs({
          url: job.normalizedUrl ?? job.url,
          homePath: jobDir,
          tempPath: tempDir,
          outputTemplate: "%(title).200B.%(ext)s"
        }),
        {
          timeoutMs: options.timeoutMs,
          onStdoutLine: (line) => {
            options.store.updateJobProgress(job.id, parseProgressLine(line));
          }
        }
      );

      const resultFile = await storage.findResultFile(job.id);
      if (!resultFile) {
        throw normalizeYtDlpError("yt-dlp completed without a result file");
      }

      options.store.completeJob(job.id, {
        fileName: resultFile.filename,
        size: resultFile.size,
        contentType: resultFile.contentType
      }, now());
      const expiresAt = new Date(now().getTime() + options.fileTtlMinutes * 60_000);
      const token = tokenService.createToken(job.id, expiresAt);
      options.store.updateJobResult(job.id, {
        fileName: resultFile.filename,
        size: resultFile.size,
        contentType: resultFile.contentType,
        downloadUrl: `${options.publicBaseUrl ?? ""}/api/download/${token}`,
        expiresAt: expiresAt.toISOString()
      });
    } catch (error) {
      const normalized =
        error instanceof ProcessRunnerError && error.timedOut
          ? { code: "DOWNLOAD_TIMEOUT", message: "下載處理逾時，請稍後再試。", retryable: true }
          : normalizeYtDlpError(error instanceof ProcessRunnerError ? `${error.message}\n${error.stderr}\n${error.stdout}` : error);
      const latest = options.store.getJob(jobId);
      if (latest?.status === "running") {
        options.store.failJob(jobId, normalized, now());
      }
    }
  }
}
