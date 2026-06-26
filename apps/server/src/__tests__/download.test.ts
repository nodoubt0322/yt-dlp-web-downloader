import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { createJobStore, type JobStore } from "../services/jobStore.js";
import { createTokenService } from "../services/tokenService.js";

const tempDirs: string[] = [];
const stores: JobStore[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function createCompletedDownload(now = new Date("2026-06-27T00:00:00.000Z")) {
  const dataDir = await mkdtemp(join(tmpdir(), "yt-dlp-download-"));
  tempDirs.push(dataDir);
  const store = createJobStore({ dbPath: join(dataDir, "state.sqlite"), now: () => now });
  stores.push(store);
  const job = store.createJob({
    url: "https://example.com/watch?v=1",
    options: {},
    expiresAt: new Date("2026-06-28T00:00:00.000Z")
  });
  store.updateJobStatus(job.id, "running", { startedAt: now });
  const jobDir = join(dataDir, "jobs", job.id);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(jobDir, { recursive: true }));
  await writeFile(join(jobDir, "demo video.mp4"), "media-bytes");
  store.completeJob(
    job.id,
    {
      fileName: "demo video.mp4",
      size: 11,
      contentType: "video/mp4",
      downloadUrl: "",
      expiresAt: "2026-06-28T00:00:00.000Z"
    },
    now
  );
  const token = createTokenService({ store, now: () => now }).createToken(job.id, new Date("2026-06-28T00:00:00.000Z"));
  return { dataDir, store, token, job };
}

describe("download route", () => {
  it("streams a known unexpired token with safe download headers", async () => {
    const { dataDir, store, token } = await createCompletedDownload();
    const app = await buildServer({
      config: { dataDir },
      services: {
        jobStore: store,
        now: () => new Date("2026-06-27T00:00:00.000Z")
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/download/${token}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("video/mp4");
    expect(response.headers["content-length"]).toBe("11");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="demo video.mp4"');
    expect(response.body).toBe("media-bytes");
  });

  it("returns pathless 404 or 410 responses for unknown and expired tokens", async () => {
    const { dataDir, store, token } = await createCompletedDownload();
    const app = await buildServer({
      config: { dataDir },
      services: {
        jobStore: store,
        now: () => new Date("2026-06-29T00:00:00.000Z")
      }
    });

    const unknown = await app.inject({
      method: "GET",
      url: "/api/download/dl_unknown"
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).not.toContain(dataDir);

    const expired = await app.inject({
      method: "GET",
      url: `/api/download/${token}`
    });
    expect(expired.statusCode).toBe(410);
    expect(expired.body).not.toContain(dataDir);
  });
});
