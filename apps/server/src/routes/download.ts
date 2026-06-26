import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../services/jobStore.js";
import { createStorageService } from "../services/storageService.js";
import { hashDownloadToken } from "../services/tokenService.js";

interface RegisterDownloadRoutesOptions {
  config: AppConfig;
  jobStore: JobStore;
  now?: () => Date;
}

export async function registerDownloadRoutes(app: FastifyInstance, options: RegisterDownloadRoutesOptions) {
  const storage = createStorageService({ dataDir: options.config.dataDir });
  const now = options.now ?? (() => new Date());

  app.get("/download/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!/^dl_[A-Za-z0-9_-]+$/.test(token)) {
      return notFound(reply);
    }

    const tokenRecord = options.jobStore.getDownloadTokenByHash(hashDownloadToken(token));
    if (!tokenRecord) {
      return notFound(reply);
    }

    const job = options.jobStore.getJob(tokenRecord.jobId);
    if (
      Date.parse(tokenRecord.expiresAt) <= now().getTime() ||
      !job ||
      job.status !== "completed" ||
      Date.parse(job.expiresAt) <= now().getTime()
    ) {
      return reply.code(410).send({ error: { code: "DOWNLOAD_EXPIRED", message: "Download link expired" } });
    }

    const result = job.result;
    if (!result) {
      return notFound(reply);
    }

    const fileName = basename(result.fileName);
    const jobDir = await storage.getJobDirectory(job.id);
    const filePath = join(jobDir, fileName);
    const fileStat = await stat(filePath);

    return reply
      .header("Content-Disposition", `attachment; filename="${sanitizeHeaderFilename(fileName)}"`)
      .header("Content-Type", result.contentType)
      .header("Content-Length", fileStat.size)
      .header("Cache-Control", "private, no-store")
      .send(createReadStream(filePath));
  });
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { code: "DOWNLOAD_NOT_FOUND", message: "Download not found" } });
}

function sanitizeHeaderFilename(filename: string) {
  return filename.replace(/["\r\n]/g, "_");
}
