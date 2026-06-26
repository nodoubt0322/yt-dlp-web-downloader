import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { mergeConfig } from "./config.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerRateLimitPlugin } from "./plugins/rateLimit.js";
import { registerAnalyzeRoutes } from "./routes/analyze.js";
import { registerDownloadRoutes } from "./routes/download.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobsRoutes } from "./routes/jobs.js";
import { registerSystemRoutes } from "./routes/system.js";
import { createJobStore, type JobStore } from "./services/jobStore.js";
import { createSystemService, type SystemService } from "./services/systemService.js";
import type { DnsResolver } from "./services/urlSafety.js";

interface BuildServerOptions {
  config?: Partial<AppConfig>;
  services?: {
    systemService?: SystemService;
    jobStore?: JobStore;
    urlResolver?: DnsResolver;
    getFreeBytes?: (dataDir: string) => Promise<number>;
    now?: () => Date;
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
  app.addHook("onClose", async () => {
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
        urlResolver: options.services?.urlResolver,
        getFreeBytes: options.services?.getFreeBytes,
        now: options.services?.now
      });
      await registerSystemRoutes(api, options.services?.systemService ?? createSystemService({ config }));
    },
    { prefix: "/api" }
  );

  return app;
}
