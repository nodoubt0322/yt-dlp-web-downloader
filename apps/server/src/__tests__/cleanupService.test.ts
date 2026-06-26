import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCleanupService } from "../services/cleanupService.js";
import { createJobStore } from "../services/jobStore.js";
import { createStorageService } from "../services/storageService.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { force: true, recursive: true }))));
  tempDirs.length = 0;
});

async function tempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-cleanup-"));
  tempDirs.push(dir);
  return dir;
}

describe("cleanupService", () => {
  it("expires old terminal jobs and deletes only their allowed job directories", async () => {
    const dataDir = await tempDataDir();
    const store = createJobStore({ dbPath: join(dataDir, "state.sqlite") });
    const storage = createStorageService({ dataDir });
    const cleanup = createCleanupService({
      store,
      storage,
      now: () => new Date("2026-06-27T12:00:00.000Z")
    });

    const expired = store.createJob({
      url: "https://example.com/expired",
      options: {},
      expiresAt: new Date("2026-06-27T11:59:59.000Z")
    });
    store.updateJobStatus(expired.id, "running");
    store.completeJob(expired.id, { fileName: "old.mp4", size: 3, contentType: "video/mp4" });
    await storage.createJobDirectory(expired.id);
    await writeFile(join(dataDir, "jobs", expired.id, "old.mp4"), "old");

    const active = store.createJob({
      url: "https://example.com/active",
      options: {},
      expiresAt: new Date("2026-06-27T11:59:59.000Z")
    });
    await storage.createJobDirectory(active.id);
    await writeFile(join(dataDir, "jobs", active.id, "active.mp4"), "active");

    const future = store.createJob({
      url: "https://example.com/future",
      options: {},
      expiresAt: new Date("2026-06-27T13:00:00.000Z")
    });
    store.updateJobStatus(future.id, "running");
    store.failJob(future.id, { code: "YTDLP_FAILED", message: "failed", retryable: false });
    await storage.createJobDirectory(future.id);
    await writeFile(join(dataDir, "jobs", future.id, "future.mp4"), "future");

    const result = await cleanup.runCleanupOnce();

    expect(result).toEqual({ expiredJobs: 1, deletedDirectories: 1 });
    expect(store.getJob(expired.id)?.status).toBe("expired");
    expect(store.getJob(active.id)?.status).toBe("queued");
    expect(store.getJob(future.id)?.status).toBe("failed");
    await expect(stat(join(dataDir, "jobs", expired.id))).rejects.toThrow();
    await expect(stat(join(dataDir, "jobs", active.id))).resolves.toBeTruthy();
    await expect(stat(join(dataDir, "jobs", future.id))).resolves.toBeTruthy();
    store.close();
  });
});
