import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildDownloadArgs, buildOptimizeVideoArgs, type QualityPreset } from "./commandBuilder.js";
import { normalizeYtDlpError } from "./errors.js";
import type { JobStore } from "./jobStore.js";
import { ProcessRunnerError, runProcess, runProcessStreaming } from "./processRunner.js";
import { parseProgressLine } from "./progressParser.js";
import { createStorageService } from "./storageService.js";
import { createTokenService } from "./tokenService.js";
import type { JobProgress } from "./types.js";

export interface CreateJobQueueOptions {
  store: JobStore;
  dataDir: string;
  ytDlpBinary: string;
  ffmpegBinary: string;
  timeoutMs: number;
  publicBaseUrl?: string;
  fileTtlMinutes: number;
  retryDelayMs?: number;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
}

export function createJobQueue(options: CreateJobQueueOptions): JobQueue {
  const storage = createStorageService({ dataDir: options.dataDir });
  const tokenService = createTokenService({ store: options.store, now: options.now });
  const now = options.now ?? (() => new Date());
  const retryMax = 3;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
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

      await runDownloadWithRetries(job.id, {
        url: job.normalizedUrl ?? job.url,
        homePath: jobDir,
        tempPath: tempDir,
        qualityPreset: readQualityPreset(job.options.qualityPreset)
      });

      let resultFile = await storage.findResultFile(job.id);
      if (!resultFile) {
        throw normalizeYtDlpError("yt-dlp completed without a result file");
      }
      resultFile = await optimizeResultFile(job.id, resultFile, tempDir);

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

  async function runDownloadWithRetries(
    jobId: string,
    download: { url: string; homePath: string; tempPath: string; qualityPreset: QualityPreset }
  ) {
    const args = buildDownloadArgs({
      url: download.url,
      homePath: download.homePath,
      tempPath: download.tempPath,
      outputTemplate: "%(title).200B.%(ext)s",
      qualityPreset: download.qualityPreset
    });

    for (let attempt = 1; attempt <= retryMax + 1; attempt += 1) {
      try {
        await runProcessStreaming(options.ytDlpBinary, args, {
          timeoutMs: options.timeoutMs,
          env: options.env,
          onStdoutLine: (line) => {
            options.store.updateJobProgress(jobId, parseProgressLine(line));
          }
        });
        return;
      } catch (error) {
        const logPath = await appendProcessFailureLog(download.homePath, error);
        if (attempt > retryMax) {
          console.error(`yt-dlp download failed for ${jobId}; no retries left: ${readProcessSummary(error)}; log=${logPath}`);
          throw error;
        }

        const retryAttempt = attempt;
        options.store.updateJobProgress(jobId, {
          phase: "retrying",
          message: `下載失敗，正在重試（第 ${retryAttempt}/${retryMax} 次）`,
          retryAttempt,
          retryMax
        });
        console.warn(`yt-dlp download failed for ${jobId}; retrying ${retryAttempt}/${retryMax}: ${readProcessSummary(error)}; log=${logPath}`);
        await sleep(retryDelayMs);
      }
    }
  }

  async function optimizeResultFile(jobId: string, resultFile: Awaited<ReturnType<typeof storage.findResultFile>>, tempDir: string) {
    if (!resultFile) {
      throw normalizeYtDlpError("yt-dlp completed without a result file");
    }

    const progressBeforeOptimize = options.store.getJob(jobId)?.progress;
    await mkdir(tempDir, { recursive: true });
    const optimizedPath = join(tempDir, `${resultFile.filename}.optimized.mp4`);
    options.store.updateJobProgress(jobId, {
      phase: "optimizing",
      message: "正在壓縮影片，降低檔案大小..."
    });

    await runProcess(
      options.ffmpegBinary,
      buildOptimizeVideoArgs({
        inputPath: resultFile.path,
        outputPath: optimizedPath
      }),
      {
        timeoutMs: options.timeoutMs,
        env: options.env
      }
    );

    const optimizedStat = await stat(optimizedPath);
    if (optimizedStat.size < resultFile.size) {
      await rm(resultFile.path, { force: true });
      await rename(optimizedPath, resultFile.path);
      restoreProgressAfterOptimize(jobId, progressBeforeOptimize);
      return {
        ...resultFile,
        size: optimizedStat.size
      };
    }

    await rm(optimizedPath, { force: true });
    restoreProgressAfterOptimize(jobId, progressBeforeOptimize);
    return resultFile;
  }

  function restoreProgressAfterOptimize(jobId: string, progress: JobProgress | null | undefined) {
    // The optimizing message is live-only. Completed jobs should show final file metadata, not stale processing copy.
    options.store.updateJobProgress(jobId, progress ?? { phase: "downloading", percent: 100 });
  }
}

async function appendProcessFailureLog(jobDir: string, error: unknown) {
  const logPath = join(jobDir, "yt-dlp.log");
  await appendFile(logPath, `${formatProcessLogEntry(error)}\n`, "utf8");
  return logPath;
}

function formatProcessLogEntry(error: unknown) {
  const timestamp = new Date().toISOString();
  if (error instanceof ProcessRunnerError) {
    return [
      `[${timestamp}] ${error.message}`,
      `exitCode=${error.exitCode ?? "unknown"} timedOut=${error.timedOut}`,
      error.stderr.trim() ? `[stderr]\n${error.stderr.trim()}` : null,
      error.stdout.trim() ? `[stdout]\n${error.stdout.trim()}` : null
    ]
      .filter(Boolean)
      .join("\n");
  }
  return `[${timestamp}] ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
}

function readProcessSummary(error: unknown) {
  if (error instanceof ProcessRunnerError) {
    return `exitCode=${error.exitCode ?? "unknown"} timedOut=${error.timedOut}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readQualityPreset(value: unknown): QualityPreset {
  if (value === "bestAvailable" || value === "bestUnder1080p" || value === "bestUnder720p" || value === "bestUnder480p") {
    return value;
  }
  return "bestAvailable";
}
