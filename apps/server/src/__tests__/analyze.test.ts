import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { createJobStore, type JobStore } from "../services/jobStore.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const mockYtDlp = resolve(testDir, "../../test-fixtures/mock-ytdlp.mjs");
const tempDirs: string[] = [];
const stores: JobStore[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-analyze-"));
  tempDirs.push(dir);
  const store = createJobStore({
    dbPath: join(dir, "state.sqlite"),
    now: () => new Date("2026-06-27T01:00:00.000Z")
  });
  stores.push(store);
  return store;
}

describe("POST /api/analyze", () => {
  it("requires bearer auth", async () => {
    const app = await buildServer({
      config: { adminToken: "test-token" },
      services: { jobStore: await createStore() }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { url: "https://example.com/watch?v=123" }
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects unsafe URLs before running yt-dlp", async () => {
    const app = await buildServer({
      config: { adminToken: "test-token", ytDlpBinary: mockYtDlp },
      services: { jobStore: await createStore() }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "http://127.0.0.1/video" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "UNSAFE_URL",
        message: "不允許分析這個網址。",
        retryable: false
      }
    });
  });

  it("normalizes metadata, stores analysis for one hour, and enforces analyze rate limit", async () => {
    await chmod(mockYtDlp, 0o755);
    const store = await createStore();
    const app = await buildServer({
      config: {
        adminToken: "test-token",
        ytDlpBinary: mockYtDlp,
        rateLimitAnalyzePerMinute: 1
      },
      services: {
        jobStore: store,
        urlResolver: async () => ["93.184.216.34"],
        now: () => new Date("2026-06-27T01:00:00.000Z")
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=123" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysisId: expect.stringMatching(/^ana_/),
      url: "https://example.com/watch?v=123",
      title: "Fixed Mock Video",
      durationSeconds: 125,
      extractor: "mock",
      recommendedOptions: {
        qualityPreset: "bestAvailable",
        preferMp4: true
      },
      formatSummary: {
        hasVideo: true,
        hasAudio: true,
        maxHeight: 1080,
        ext: "mp4",
        qualityEstimates: [
          { preset: "bestAvailable", height: 1080, sizeBytes: 19_000_000, approximate: false },
          { preset: "bestUnder1080p", height: 1080, sizeBytes: 19_000_000, approximate: false },
          { preset: "bestUnder720p", height: 720, sizeBytes: 11_000_000, approximate: true },
          { preset: "bestUnder480p", height: 480, sizeBytes: 7_000_000, approximate: false }
        ]
      }
    });

    const analysis = store.getAnalysis(response.json().analysisId);
    expect(analysis).toMatchObject({
      url: "https://example.com/watch?v=123",
      expiresAt: "2026-06-27T02:00:00.000Z"
    });
    expect(analysis?.metadata).toMatchObject({
      analysisId: response.json().analysisId,
      title: "Fixed Mock Video"
    });

    const limited = await app.inject({
      method: "POST",
      url: "/api/analyze",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=456" }
    });

    expect(limited.statusCode).toBe(429);
  });

  it("returns ANALYZE_TIMEOUT when the analyze process exceeds its timeout", async () => {
    await chmod(mockYtDlp, 0o755);
    const app = await buildServer({
      config: {
        adminToken: "test-token",
        ytDlpBinary: mockYtDlp,
        analyzeTimeoutMs: 25
      },
      services: {
        jobStore: await createStore(),
        urlResolver: async () => ["93.184.216.34"]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyze",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=timeout" }
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      error: {
        code: "ANALYZE_TIMEOUT",
        message: "分析處理逾時，請稍後再試。",
        retryable: true
      }
    });
    expect(response.body).not.toContain("/Users/");
    expect(response.body).not.toContain(" at ");
  });
});
