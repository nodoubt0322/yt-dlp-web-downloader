import type { FastifyInstance } from "fastify";
import type { SystemService } from "../services/systemService.js";

export async function registerSystemRoutes(app: FastifyInstance, systemService: SystemService) {
  app.get("/system/check", async () => systemService.check());
}
