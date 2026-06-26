import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJobStore } from "../services/jobStore.js";
import { createTokenService, hashDownloadToken } from "../services/tokenService.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

async function createCompletedJob() {
  const dir = await mkdtemp(join(tmpdir(), "yt-dlp-token-"));
  tempDirs.push(dir);
  const store = createJobStore({ dbPath: join(dir, "state.sqlite") });
  const job = store.createJob({
    url: "https://example.com/watch?v=1",
    options: {},
    expiresAt: new Date("2026-06-28T00:00:00.000Z")
  });
  store.updateJobStatus(job.id, "running", { startedAt: new Date("2026-06-27T00:00:00.000Z") });
  store.completeJob(job.id, { fileName: "demo.mp4", size: 10, contentType: "video/mp4" });
  return { store, job };
}

describe("tokenService", () => {
  it("generates URL-safe dl_ tokens with at least 128 bits of entropy and stores only SHA-256 hashes", async () => {
    const { store, job } = await createCompletedJob();
    const service = createTokenService({ store, now: () => new Date("2026-06-27T00:00:00.000Z") });

    const token = service.createToken(job.id, new Date("2026-06-28T00:00:00.000Z"));
    const record = store.getDownloadTokenByHash(hashDownloadToken(token));

    expect(token).toMatch(/^dl_[A-Za-z0-9_-]{22,}$/);
    expect(record).toMatchObject({
      tokenHash: hashDownloadToken(token),
      jobId: job.id,
      expiresAt: "2026-06-28T00:00:00.000Z",
      usedAt: null
    });
    expect(JSON.stringify(record)).not.toContain(token);
    store.close();
  });

  it("validates known unexpired tokens and rejects unknown, expired, and expired-job tokens", async () => {
    const { store, job } = await createCompletedJob();
    const service = createTokenService({ store, now: () => new Date("2026-06-27T12:00:00.000Z") });
    const token = service.createToken(job.id, new Date("2026-06-27T13:00:00.000Z"));

    expect(service.validateToken(token)?.job.id).toBe(job.id);
    expect(service.validateToken("dl_unknown")).toBeNull();

    const expiredToken = service.createToken(job.id, new Date("2026-06-27T11:59:59.000Z"));
    expect(service.validateToken(expiredToken)).toBeNull();

    store.expireJob(job.id);
    expect(service.validateToken(token)).toBeNull();
    store.close();
  });
});
