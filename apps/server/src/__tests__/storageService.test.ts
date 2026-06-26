import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageService } from "../services/storageService.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => import("node:fs/promises").then(({ rm }) => rm(dir, { force: true, recursive: true }))));
  tempDirs.length = 0;
});

async function tempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-storage-"));
  tempDirs.push(dir);
  return dir;
}

describe("storageService", () => {
  it("creates DATA_DIR/jobs/{jobId} only for valid job IDs with resolved containment", async () => {
    const dataDir = await tempDataDir();
    const storage = createStorageService({ dataDir });

    const jobDir = await storage.createJobDirectory("job_valid123");

    expect(jobDir).toBe(resolve(dataDir, "jobs", "job_valid123"));
    await expect(stat(jobDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(storage.createJobDirectory("../job_escape")).rejects.toThrow(/Invalid job ID/);
    await expect(storage.createJobDirectory("ana_wrongprefix")).rejects.toThrow(/Invalid job ID/);
  });

  it("detects completed result files while excluding temp and partial files", async () => {
    const dataDir = await tempDataDir();
    const storage = createStorageService({ dataDir });
    const jobDir = await storage.createJobDirectory("job_result1");
    await mkdir(join(jobDir, "tmp"));
    await writeFile(join(jobDir, "video.mp4.part"), "partial");
    await writeFile(join(jobDir, "tmp", "ignored.mp4"), "ignored");
    await writeFile(join(jobDir, "video.mp4"), "complete");

    await expect(storage.findResultFile("job_result1")).resolves.toEqual({
      path: join(jobDir, "video.mp4"),
      filename: "video.mp4",
      size: 8,
      contentType: "video/mp4"
    });
  });

  it("deletes only allowed job directories under DATA_DIR/jobs", async () => {
    const dataDir = await tempDataDir();
    const storage = createStorageService({ dataDir });
    const jobDir = await storage.createJobDirectory("job_delete1");
    const outside = join(dataDir, "keep.txt");
    await writeFile(join(jobDir, "video.mp4"), "complete");
    await writeFile(outside, "do not delete");

    await storage.deleteJobDirectory("job_delete1");

    await expect(stat(jobDir)).rejects.toThrow();
    await expect(stat(outside)).resolves.toBeTruthy();
    await expect(storage.deleteJobDirectory("../outside")).rejects.toThrow(/Invalid job ID/);
  });
});
