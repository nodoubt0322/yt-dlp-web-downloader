import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJobStore } from "../services/jobStore.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

async function tempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-store-"));
  tempDirs.push(dir);
  return join(dir, "state.sqlite");
}

describe("jobStore", () => {
  it("persists analyses, job state, progress, result, error, options, and timestamps", async () => {
    const dbPath = await tempDbPath();
    const store = createJobStore({ dbPath, now: () => new Date("2026-06-27T01:00:00.000Z") });
    const analysis = store.createAnalysis({
      url: "https://example.com/watch?v=1",
      metadata: { title: "Demo", durationSeconds: 30 },
      expiresAt: new Date("2026-06-27T02:00:00.000Z")
    });

    const job = store.createJob({
      analysisId: analysis.id,
      url: "https://example.com/watch?v=1",
      normalizedUrl: "https://example.com/watch?v=1",
      title: "Demo",
      extractor: "Example",
      options: { qualityPreset: "bestUnder1080p" },
      expiresAt: new Date("2026-06-28T01:00:00.000Z")
    });

    store.updateJobStatus(job.id, "running", { startedAt: new Date("2026-06-27T01:01:00.000Z") });
    store.updateJobProgress(job.id, { phase: "download", percent: 42.5, downloadedBytes: 1024 });
    store.completeJob(job.id, {
      fileName: "demo.mp4",
      size: 4096,
      contentType: "video/mp4"
    }, new Date("2026-06-27T01:02:00.000Z"));
    store.close();

    const reloaded = createJobStore({ dbPath });
    expect(reloaded.getAnalysis(analysis.id)).toMatchObject({
      id: expect.stringMatching(/^ana_/),
      metadata: { title: "Demo", durationSeconds: 30 }
    });
    expect(reloaded.getJob(job.id)).toMatchObject({
      id: expect.stringMatching(/^job_/),
      analysisId: analysis.id,
      status: "completed",
      progress: { phase: "download", percent: 42.5, downloadedBytes: 1024 },
      result: { fileName: "demo.mp4", size: 4096, contentType: "video/mp4" },
      error: null,
      options: { qualityPreset: "bestUnder1080p" },
      createdAt: "2026-06-27T01:00:00.000Z",
      startedAt: "2026-06-27T01:01:00.000Z",
      completedAt: "2026-06-27T01:02:00.000Z",
      expiresAt: "2026-06-28T01:00:00.000Z"
    });
    reloaded.close();
  });

  it("lists queued jobs oldest first and enforces allowed status transitions", async () => {
    const store = createJobStore({ dbPath: await tempDbPath() });
    const first = store.createJob({ url: "https://example.com/1", options: {}, expiresAt: new Date("2026-06-28") });
    const second = store.createJob({ url: "https://example.com/2", options: {}, expiresAt: new Date("2026-06-28") });

    expect(store.listQueuedJobs().map((job) => job.id)).toEqual([first.id, second.id]);

    store.updateJobStatus(first.id, "running", { startedAt: new Date("2026-06-27T01:00:00.000Z") });
    store.failJob(first.id, { code: "YTDLP_FAILED", message: "failed", retryable: false });
    store.expireJob(first.id);

    expect(store.getJob(first.id)?.status).toBe("expired");
    expect(() => store.updateJobStatus(first.id, "running")).toThrow(/Invalid job status transition/);
    store.close();
  });
});
