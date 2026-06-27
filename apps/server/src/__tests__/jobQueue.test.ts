import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../services/jobQueue.js";
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
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-queue-"));
  tempDirs.push(dir);
  const store = createJobStore({ dbPath: join(dir, "state.sqlite") });
  stores.push(store);
  return { store, dataDir: dir };
}

describe("jobQueue", () => {
  it("runs one FIFO download at a time, records progress, and stores signed result metadata", async () => {
    await chmod(mockYtDlp, 0o755);
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
      timeoutMs: 5_000,
      publicBaseUrl: "",
      fileTtlMinutes: 3
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
        size: 12,
        contentType: "video/mp4",
        downloadUrl: expect.stringMatching(new RegExp(`^/api/download/dl_`)),
        expiresAt: expect.any(String)
      }
    });
    expect(store.getJob(second.id)?.status).toBe("completed");
  });

  it("fails the job with a normalized error when yt-dlp exits unsuccessfully", async () => {
    await chmod(mockYtDlp, 0o755);
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
