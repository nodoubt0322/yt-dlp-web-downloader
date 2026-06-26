import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("static frontend serving", () => {
  it("serves built frontend HTML without letting SPA fallback bypass API auth", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "yt-dlp-static-"));
    tempDirs.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<!doctype html><title>yt-dlp 影片下載器</title>");

    const app = await buildServer({
      config: { adminToken: "test-token" },
      staticDir
    });

    const frontend = await app.inject({ method: "GET", url: "/" });
    expect(frontend.statusCode).toBe(200);
    expect(frontend.headers["content-type"]).toContain("text/html");
    expect(frontend.body).toContain("yt-dlp 影片下載器");

    const apiFallbackAttempt = await app.inject({ method: "GET", url: "/api/not-a-real-route" });
    expect(apiFallbackAttempt.statusCode).toBe(401);
    expect(apiFallbackAttempt.body).not.toContain("yt-dlp 影片下載器");
  });
});

