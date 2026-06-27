import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { formatListenUrl } from "./startup.js";

const config = loadConfig();
const host = process.env.HOST ?? "127.0.0.1";
const staticDir = process.env.STATIC_DIR ?? new URL("../../web/dist", import.meta.url).pathname;

const app = await buildServer({ config, staticDir });

await app.listen({ port: config.port, host });
console.log(`Server listening on ${formatListenUrl(host, config.port)}`);
