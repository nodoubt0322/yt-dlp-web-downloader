import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const host = process.env.HOST ?? "127.0.0.1";

const app = await buildServer({ config });

await app.listen({ port: config.port, host });
