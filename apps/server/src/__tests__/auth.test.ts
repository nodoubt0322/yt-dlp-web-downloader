import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";
import { createFixedWindowRateLimiter } from "../plugins/rateLimit.js";

describe("loadConfig", () => {
  it("loads explicit MVP defaults", () => {
    const config = loadConfig({ NODE_ENV: "test" });

    expect(config.port).toBe(8787);
    expect(config.dataDir).toContain("data");
    expect(config.adminToken).toBeUndefined();
    expect(config.analyzeTimeoutMs).toBe(60_000);
    expect(config.downloadTimeoutMs).toBe(3_600_000);
    expect(config.fileTtlHours).toBe(24);
    expect(config.cleanupIntervalMs).toBe(15 * 60_000);
    expect(config.minFreeDiskBytes).toBe(1_073_741_824);
    expect(config.rateLimitAnalyzePerMinute).toBe(20);
    expect(config.rateLimitJobCreatePerMinute).toBe(10);
    expect(config.ytDlpBinary).toBe("yt-dlp");
    expect(config.ffmpegBinary).toBe("ffmpeg");
    expect(config.ffprobeBinary).toBe("ffprobe");
  });

  it("requires ADMIN_TOKEN in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/ADMIN_TOKEN/);
  });
});

describe("auth", () => {
  it("keeps /health public when ADMIN_TOKEN is set", async () => {
    const app = await buildServer({
      config: {
        adminToken: "test-admin-token"
      }
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("rejects /api/system/check without a bearer token when ADMIN_TOKEN is set", async () => {
    const app = await buildServer({
      config: {
        adminToken: "test-admin-token"
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/system/check" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
    expect(response.body).not.toContain("test-admin-token");
  });

  it("rejects /api/system/check with the wrong bearer token", async () => {
    const app = await buildServer({
      config: {
        adminToken: "test-admin-token"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/system/check",
      headers: {
        authorization: "Bearer wrong-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("test-admin-token");
    expect(response.body).not.toContain("wrong-token");
  });

  it("accepts /api/system/check with the configured bearer token", async () => {
    const app = await buildServer({
      config: {
        adminToken: "test-admin-token"
      },
      services: {
        systemService: {
          check: async () => ({
            ytDlp: { ok: true, version: "2026.01.01" },
            ffmpeg: { ok: true, version: "6.1" },
            ffprobe: { ok: true, version: "6.1" },
            storage: {
              ok: true,
              writable: true,
              freeBytes: 10_000,
              minRequiredFreeBytes: 1_000
            }
          })
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/system/check",
      headers: {
        authorization: "Bearer test-admin-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ytDlp: { ok: true, version: "2026.01.01" },
      storage: { writable: true }
    });
  });
});

describe("createFixedWindowRateLimiter", () => {
  it("rejects requests after the configured fixed-window limit", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: () => 1_000
    });

    expect(limiter("same-client").allowed).toBe(true);
    expect(limiter("same-client").allowed).toBe(true);
    expect(limiter("same-client")).toMatchObject({ allowed: false });
  });
});
