import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { QualityPreset } from "../services/commandBuilder.js";
import { normalizeYtDlpError } from "../services/errors.js";
import { createJobQueue, type JobQueue } from "../services/jobQueue.js";
import type { JobStore } from "../services/jobStore.js";
import { assertSafeHttpUrl, UnsafeUrlError, type DnsResolver } from "../services/urlSafety.js";

interface RegisterJobsRoutesOptions {
  config: AppConfig;
  jobStore: JobStore;
  queue?: JobQueue;
  urlResolver?: DnsResolver;
  getFreeBytes?: (dataDir: string) => Promise<number>;
  now?: () => Date;
  usageLog?: boolean;
  logUsage?: (date: Date) => void;
}

export async function registerJobsRoutes(app: FastifyInstance, options: RegisterJobsRoutesOptions) {
  const queue =
    options.queue ??
    createJobQueue({
      store: options.jobStore,
      dataDir: options.config.dataDir,
      ytDlpBinary: options.config.ytDlpBinary,
      ffmpegBinary: options.config.ffmpegBinary,
      timeoutMs: options.config.downloadTimeoutMs,
      publicBaseUrl: options.config.publicBaseUrl,
      fileTtlMinutes: options.config.fileTtlMinutes,
      now: options.now
    });

  app.post("/jobs", async (request, reply) => {
    const body = request.body as { url?: unknown; analysisId?: unknown; options?: unknown } | undefined;
    const prepared = await prepareJobInput(body, options);

    if ("error" in prepared) {
      return reply.code(prepared.statusCode).send({ error: prepared.error });
    }

    const freeBytes = await readFreeBytes(options);
    if (freeBytes < options.config.minFreeDiskBytes) {
      return reply.code(507).send({
        error: normalizeYtDlpError("insufficient disk")
      });
    }

    const job = options.jobStore.createJob({
      ...prepared.input,
      options: readDownloadOptions(body?.options),
      expiresAt: new Date((options.now ?? (() => new Date()))().getTime() + options.config.fileTtlMinutes * 60_000)
    });

    if (options.usageLog) {
      options.logUsage?.((options.now ?? (() => new Date()))());
    }

    void queue.enqueue(job.id);

    return reply.code(202).send({
      jobId: job.id,
      status: "queued",
      statusUrl: `/api/jobs/${job.id}`
    });
  });

  app.get("/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = options.jobStore.getJob(jobId);

    if (!job) {
      return reply.code(404).send({
        error: {
          code: "JOB_NOT_FOUND",
          message: "Job not found",
          retryable: false
        }
      });
    }

    return reply.send({
      jobId: job.id,
      id: job.id,
      analysisId: job.analysisId,
      url: job.normalizedUrl ?? job.url,
      title: job.title,
      extractor: job.extractor,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt
    });
  });
}

async function prepareJobInput(
  body: { url?: unknown; analysisId?: unknown } | undefined,
  options: RegisterJobsRoutesOptions
) {
  if (!body || (typeof body.url !== "string" && typeof body.analysisId !== "string")) {
    return validationError("url or analysisId is required");
  }

  if (typeof body.analysisId === "string") {
    const analysis = options.jobStore.getAnalysis(body.analysisId);
    if (!analysis) {
      return validationError("analysisId was not found");
    }
    const metadata = analysis.metadata;
    return {
      input: {
        analysisId: analysis.id,
        url: analysis.url,
        normalizedUrl: analysis.url,
        title: readString(metadata.title),
        extractor: readString(metadata.extractor)
      }
    };
  }

  try {
    const normalizedUrl = await assertSafeHttpUrl(body.url as string, options.urlResolver);
    return {
      input: {
        url: normalizedUrl,
        normalizedUrl
      }
    };
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return {
        statusCode: 400,
        error: {
          code: "UNSAFE_URL",
          message: "不允許下載這個網址。",
          retryable: false
        }
      };
    }
    throw error;
  }
}

function validationError(message: string) {
  return {
    statusCode: 400,
    error: {
      code: "VALIDATION_ERROR",
      message,
      retryable: false
    }
  };
}

function readDownloadOptions(value: unknown) {
  const input = value && typeof value === "object" ? (value as { qualityPreset?: unknown }) : {};
  return {
    qualityPreset: readQualityPreset(input.qualityPreset)
  };
}

function readQualityPreset(value: unknown): QualityPreset {
  if (value === "bestAvailable" || value === "bestUnder1080p" || value === "bestUnder720p" || value === "bestUnder480p") {
    return value;
  }
  return "bestAvailable";
}

async function readFreeBytes(options: RegisterJobsRoutesOptions) {
  if (options.getFreeBytes) {
    return options.getFreeBytes(options.config.dataDir);
  }

  const { mkdir, statfs } = await import("node:fs/promises");
  await mkdir(options.config.dataDir, { recursive: true });
  const stats = await statfs(options.config.dataDir);
  return stats.bavail * stats.bsize;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
