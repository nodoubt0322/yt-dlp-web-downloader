import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobQueue } from "../services/jobQueue.js";
import { createJobStore, type JobStore } from "../services/jobStore.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const mockYtDlp = resolve(testDir, "../../test-fixtures/mock-ytdlp.mjs");
const mockFfmpeg = resolve(testDir, "../../test-fixtures/mock-ffmpeg.mjs");
const tempDirs: string[] = [];
const stores: JobStore[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-queue-"));
  tempDirs.push(dir);
  const store = createJobStore({ dbPath: join(dir, "state.sqlite") });
  stores.push(store);
  return { store, dataDir: dir };
}

describe("jobQueue", () => {
  it("runs one FIFO download at a time, records progress, and stores signed result metadata", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const { store, dataDir } = await createStore();
    const first = store.createJob({
      url: "https://example.com/watch?v=first",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const second = store.createJob({
      url: "https://example.com/watch?v=second",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3,
      retryDelayMs: 1
    });

    const firstRun = queue.enqueue(first.id);
    const secondRun = queue.enqueue(second.id);
    await waitFor(() => store.getJob(first.id)?.status === "running");

    expect(store.getJob(second.id)?.status).toBe("queued");

    await Promise.all([firstRun, secondRun]);

    expect(store.getJob(first.id)).toMatchObject({
      status: "completed",
      progress: {
        phase: "downloading",
        percent: 100,
        downloadedBytes: 12,
        totalBytes: 12,
        speedBytesPerSecond: 4096,
        etaSeconds: 0
      },
      result: {
        fileName: "mock-video.mp4",
        size: 5,
        contentType: "video/mp4",
        downloadUrl: expect.stringMatching(new RegExp(`^/api/download/dl_`)),
        expiresAt: expect.any(String)
      }
    });
    expect(store.getJob(second.id)?.status).toBe("completed");
  });

  it("fails the job with a normalized error when yt-dlp exits unsuccessfully", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const { store, dataDir } = await createStore();
    const job = store.createJob({
      url: "https://example.com/watch?v=fail",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3
    });

    await queue.enqueue(job.id);

    expect(store.getJob(job.id)).toMatchObject({
      status: "failed",
      error: {
        code: "UNSUPPORTED_URL",
        message: "不支援或無法解析這個網址。",
        retryable: false
      }
    });
  });

  it("writes full yt-dlp failure details to a job log and keeps terminal output short", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, dataDir } = await createStore();
    const job = store.createJob({
      url: "https://example.com/watch?v=fail",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3,
      retryDelayMs: 1
    });

    await queue.enqueue(job.id);

    const terminalOutput = [...warn.mock.calls, ...error.mock.calls].flat().join("\n");
    expect(terminalOutput).toContain(`yt-dlp download failed for ${job.id}`);
    expect(terminalOutput).toContain("log=");
    expect(terminalOutput).not.toContain("/Users/private/video.mp4");
    expect(terminalOutput).not.toContain("Unsupported URL");

    const jobLog = await readFile(join(dataDir, "jobs", job.id, "yt-dlp.log"), "utf8");
    expect(jobLog).toContain("Process exited with code 1");
    expect(jobLog).toContain("ERROR: Unsupported URL: /Users/private/video.mp4");
  });

  it("retries transient yt-dlp download failures and exposes retry progress", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const { store, dataDir } = await createStore();
    const job = store.createJob({
      url: "https://example.com/watch?v=flaky-once",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3,
      retryDelayMs: 50
    });

    const run = queue.enqueue(job.id);
    await waitFor(() => store.getJob(job.id)?.progress?.phase === "retrying");

    expect(store.getJob(job.id)?.progress).toMatchObject({
      phase: "retrying",
      message: "下載失敗，正在重試（第 1/3 次）",
      retryAttempt: 1,
      retryMax: 3
    });

    await run;

    expect(store.getJob(job.id)?.status).toBe("completed");
  });

  it("keeps the original download when ffmpeg output is not smaller", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const { store, dataDir } = await createStore();
    const job = store.createJob({
      url: "https://example.com/watch?v=original-smaller",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3,
      env: { FFMPEG_MOCK_MODE: "larger" }
    });

    await queue.enqueue(job.id);

    expect(store.getJob(job.id)).toMatchObject({
      status: "completed",
      result: {
        fileName: "mock-video.mp4",
        size: 12
      }
    });
  });

  it("exposes an optimization progress message before completing", async () => {
    await Promise.all([chmod(mockYtDlp, 0o755), chmod(mockFfmpeg, 0o755)]);
    const { store, dataDir } = await createStore();
    const job = store.createJob({
      url: "https://example.com/watch?v=optimize",
      options: {},
      expiresAt: new Date(Date.now() + 60_000)
    });
    const queue = createJobQueue({
      store,
      dataDir,
      ytDlpBinary: mockYtDlp,
      ffmpegBinary: mockFfmpeg,
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3
    });

    const run = queue.enqueue(job.id);
    await waitFor(() => store.getJob(job.id)?.progress?.phase === "optimizing");

    expect(store.getJob(job.id)?.progress).toMatchObject({
      phase: "optimizing",
      message: "正在壓縮影片，降低檔案大小..."
    });

    await run;
    expect(store.getJob(job.id)?.status).toBe("completed");
  });
});

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
