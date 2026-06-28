import type { FastifyInstance } from "fastify";
import { join } from "node:path";
import type { AppConfig } from "../config.js";
import { createId } from "../services/id.js";
import type { JobStore } from "../services/jobStore.js";
import { assertSafeHttpUrl, UnsafeUrlError, type DnsResolver } from "../services/urlSafety.js";
import { analyzeWithYtDlp } from "../services/ytdlpAdapter.js";

interface RegisterAnalyzeRoutesOptions {
  config: AppConfig;
  jobStore: JobStore;
  urlResolver?: DnsResolver;
  now?: () => Date;
}

export async function registerAnalyzeRoutes(app: FastifyInstance, options: RegisterAnalyzeRoutesOptions) {
  app.post("/analyze", async (request, reply) => {
    const body = request.body as { url?: unknown } | undefined;
    if (!body || typeof body.url !== "string") {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "url is required",
          retryable: false
        }
      });
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = await assertSafeHttpUrl(body.url, options.urlResolver);
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        return reply.code(400).send({
          error: {
            code: "UNSAFE_URL",
            message: "不允許分析這個網址。",
            retryable: false
          }
        });
      }
      throw error;
    }

    try {
      const analysisId = createId("ana");
      const metadata = await analyzeWithYtDlp({
        url: normalizedUrl,
        ytDlpBinary: options.config.ytDlpBinary,
        timeoutMs: options.config.analyzeTimeoutMs,
        logDir: join(options.config.dataDir, "logs")
      });
      const responseBody = {
        analysisId,
        ...metadata,
        url: normalizedUrl
      };

      options.jobStore.createAnalysis({
        id: analysisId,
        url: normalizedUrl,
        metadata: responseBody,
        expiresAt: new Date((options.now ?? (() => new Date()))().getTime() + 60 * 60_000)
      });

      return reply.send(responseBody);
    } catch (error) {
      if (isPublicError(error)) {
        return reply.code(error.code === "ANALYZE_TIMEOUT" ? 504 : 400).send({ error });
      }
      return reply.code(500).send({
        error: {
          code: "YTDLP_FAILED",
          message: "yt-dlp 執行失敗，請稍後再試。",
          retryable: true
        }
      });
    }
  });
}

function isPublicError(value: unknown): value is { code: string; message: string; retryable: boolean } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string" &&
    typeof (value as { retryable?: unknown }).retryable === "boolean"
  );
}
