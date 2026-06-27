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
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-jobs-"));
  tempDirs.push(dir);
  const store = createJobStore({ dbPath: join(dir, "state.sqlite") });
  stores.push(store);
  return { store, dataDir: dir };
}

describe("jobs routes", () => {
  it("creates an authenticated queued job from a URL and exposes polling state through completion", async () => {
    await chmod(mockYtDlp, 0o755);
    const { store, dataDir } = await createStore();
    const app = await buildServer({
      config: {
        adminToken: "test-token",
        dataDir,
        ytDlpBinary: mockYtDlp,
        minFreeDiskBytes: 1,
        downloadTimeoutMs: 5_000
      },
      services: {
        jobStore: store,
        urlResolver: async () => ["93.184.216.34"],
        getFreeBytes: async () => 10_000
      }
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=123" }
    });

    expect(created.statusCode).toBe(202);
    expect(created.json()).toEqual({
      jobId: expect.stringMatching(/^job_/),
      status: "queued",
      statusUrl: expect.stringMatching(/^\/api\/jobs\/job_/)
    });

    const jobId = created.json().jobId;
    const completed = await pollJob(app, jobId);

    expect(completed).toMatchObject({
      id: jobId,
      jobId,
      status: "completed",
      progress: { phase: "downloading", percent: 100 },
      result: {
        fileName: "mock-video.mp4",
        size: 12,
        contentType: "video/mp4",
        downloadUrl: expect.stringMatching(/^\/api\/download\/dl_/),
        expiresAt: expect.any(String)
      },
      error: null
    });
  });

  it("creates a job from a stored analysisId", async () => {
    await chmod(mockYtDlp, 0o755);
    const { store, dataDir } = await createStore();
    const analysis = store.createAnalysis({
      url: "https://example.com/watch?v=analysis",
      metadata: { title: "Analyzed Video", extractor: "mock" },
      expiresAt: new Date(Date.now() + 60_000)
    });
    const app = await buildServer({
      config: { adminToken: "test-token", dataDir, ytDlpBinary: mockYtDlp, minFreeDiskBytes: 1 },
      services: {
        jobStore: store,
        getFreeBytes: async () => 10_000
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: { analysisId: analysis.id }
    });

    expect(response.statusCode).toBe(202);
    expect(store.getJob(response.json().jobId)).toMatchObject({
      analysisId: analysis.id,
      url: "https://example.com/watch?v=analysis",
      title: "Analyzed Video",
      extractor: "mock"
    });
  });

  it("expires created jobs after the configured three-minute TTL", async () => {
    const { store, dataDir } = await createStore();
    const now = new Date("2026-06-27T01:00:00.000Z");
    const app = await buildServer({
      config: { adminToken: "test-token", dataDir, minFreeDiskBytes: 1 },
      services: {
        jobStore: store,
        queue: { enqueue: async () => undefined },
        urlResolver: async () => ["93.184.216.34"],
        getFreeBytes: async () => 10_000,
        now: () => now
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=ttl" }
    });

    expect(response.statusCode).toBe(202);
    expect(store.getJob(response.json().jobId)?.expiresAt).toBe("2026-06-27T01:03:00.000Z");
  });

  it("rejects invalid input, unsafe URLs, insufficient disk space, and missing jobs", async () => {
    const { store, dataDir } = await createStore();
    const app = await buildServer({
      config: {
        adminToken: "test-token",
        dataDir,
        minFreeDiskBytes: 1_000
      },
      services: {
        jobStore: store,
        getFreeBytes: async () => 10
      }
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: {}
    });
    expect(invalid.statusCode).toBe(400);

    const unsafe = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "http://127.0.0.1/video" }
    });
    expect(unsafe.statusCode).toBe(400);
    expect(unsafe.json().error.code).toBe("UNSAFE_URL");

    const lowDisk = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: "Bearer test-token" },
      payload: { url: "https://example.com/watch?v=123" }
    });
    expect(lowDisk.statusCode).toBe(507);
    expect(lowDisk.json().error.code).toBe("INSUFFICIENT_DISK_SPACE");

    const missing = await app.inject({
      method: "GET",
      url: "/api/jobs/job_missing",
      headers: { authorization: "Bearer test-token" }
    });
    expect(missing.statusCode).toBe(404);
  });
});

async function pollJob(app: Awaited<ReturnType<typeof buildServer>>, jobId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/jobs/${jobId}`,
      headers: { authorization: "Bearer test-token" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    if (body.status === "completed" || body.status === "failed") {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Job did not reach a terminal state");
}
