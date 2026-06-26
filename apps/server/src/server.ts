import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { mergeConfig } from "./config.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerRateLimitPlugin } from "./plugins/rateLimit.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSystemRoutes } from "./routes/system.js";
import { createSystemService, type SystemService } from "./services/systemService.js";

interface BuildServerOptions {
  config?: Partial<AppConfig>;
  services?: {
    systemService?: SystemService;
  };
}

export async function buildServer(options: BuildServerOptions = {}) {
  const config = mergeConfig(options.config);
  const app = Fastify({
    logger: false
  });

  await registerHealthRoutes(app);
  await app.register(
    async (api) => {
      await registerAuthPlugin(api, config);
      await registerRateLimitPlugin(api, config);
      await registerSystemRoutes(api, options.services?.systemService ?? createSystemService({ config }));
    },
    { prefix: "/api" }
  );

  return app;
}
