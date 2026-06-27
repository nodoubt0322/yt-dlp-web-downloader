import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./config.js";
import { mergeConfig } from "./config.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerRateLimitPlugin } from "./plugins/rateLimit.js";
import { registerAnalyzeRoutes } from "./routes/analyze.js";
import { registerDownloadRoutes } from "./routes/download.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerSystemRoutes } from "./routes/system.js";
import { createCleanupService } from "./services/cleanupService.js";
import type { JobQueue } from "./services/jobQueue.js";
import { createJobStore, type JobStore } from "./services/jobStore.js";
import { createStorageService } from "./services/storageService.js";
import { createSystemService, type SystemService } from "./services/systemService.js";
import type { DnsResolver } from "./services/urlSafety.js";

interface BuildServerOptions {
  config?: Partial<AppConfig>;
  staticDir?: string;
  services?: {
    systemService?: SystemService;
    jobStore?: JobStore;
    queue?: JobQueue;
    urlResolver?: DnsResolver;
    getFreeBytes?: (dataDir: string) => Promise<number>;
    now?: () => Date;
    cleanupService?: ReturnType<typeof createCleanupService>;
  };
}

export async function buildServer(options: BuildServerOptions = {}) {
  const config = mergeConfig(options.config);
  const defaultJobStore =
    options.services?.jobStore ??
    createJobStore({
      dbPath: process.env.NODE_ENV === "test" ? ":memory:" : `${config.dataDir}/state.sqlite`
    });
  const app = Fastify({
    logger: false
  });
  const cleanupService =
    options.services?.cleanupService ??
    (options.staticDir
      ? createCleanupService({
          store: defaultJobStore,
          storage: createStorageService({ dataDir: config.dataDir })
        })
      : undefined);
  const stopCleanup = cleanupService?.start(config.cleanupIntervalMs);
  app.addHook("onRequest", async (request, reply) => {
    if (
      config.adminToken &&
      request.url.startsWith("/api/") &&
      !request.url.startsWith("/api/download/") &&
      request.headers.authorization !== `Bearer ${config.adminToken}`
    ) {
      return reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid bearer token"
        }
      });
    }
  });
  app.addHook("onClose", async () => {
    stopCleanup?.();
    if (!options.services?.jobStore) {
      defaultJobStore.close();
    }
  });

  await registerHealthRoutes(app);
  await app.register(
    async (downloadApi) => {
      await registerDownloadRoutes(downloadApi, {
        config,
        jobStore: defaultJobStore,
        now: options.services?.now
      });
    },
    { prefix: "/api" }
  );
  await app.register(
    async (api) => {
      await registerAuthPlugin(api, config);
      await registerRateLimitPlugin(api, config);
      await registerAnalyzeRoutes(api, {
        config,
        jobStore: defaultJobStore,
        urlResolver: options.services?.urlResolver,
        now: options.services?.now
      });
      await registerJobsRoutes(api, {
        config,
        jobStore: defaultJobStore,
        queue: options.services?.queue,
        urlResolver: options.services?.urlResolver,
        getFreeBytes: options.services?.getFreeBytes,
        now: options.services?.now
      });
      await registerSystemRoutes(api, options.services?.systemService ?? createSystemService({ config }));
    },
    { prefix: "/api" }
  );
  if (options.staticDir) {
    await app.register(fastifyStatic, {
      root: options.staticDir,
      wildcard: false
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.method !== "GET") {
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Not found"
          }
        });
      }

      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    });
  }

  return app;
}
