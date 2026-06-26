import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { createSystemService } from "../services/systemService.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

describe("system service", () => {
  it("returns dependency versions and storage capacity", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "yt-dlp-web-downloader-"));
    tempDirs.push(dataDir);

    const service = createSystemService({
      config: {
        dataDir,
        ytDlpBinary: "yt-dlp",
        ffmpegBinary: "ffmpeg",
        ffprobeBinary: "ffprobe",
        minFreeDiskBytes: 1_024
      },
      runCommand: async (command, args) => {
        if (command === "yt-dlp") {
          expect(args).toEqual(["--version"]);
          return { stdout: "2026.01.01\n", stderr: "" };
        }

        expect(args).toEqual(["-version"]);
        return { stdout: `${command} version 6.1 Copyright\n`, stderr: "" };
      },
      getFreeBytes: async () => 10_240
    });

    const result = await service.check();

    expect(result).toEqual({
      ytDlp: { ok: true, version: "2026.01.01" },
      ffmpeg: { ok: true, version: "6.1" },
      ffprobe: { ok: true, version: "6.1" },
      storage: {
        ok: true,
        writable: true,
        freeBytes: 10_240,
        minRequiredFreeBytes: 1_024
      }
    });
  });
});

describe("system route", () => {
  it("returns the system check shape for an authenticated admin", async () => {
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
              freeBytes: 10_240,
              minRequiredFreeBytes: 1_024
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
    expect(response.json()).toEqual({
      ytDlp: { ok: true, version: "2026.01.01" },
      ffmpeg: { ok: true, version: "6.1" },
      ffprobe: { ok: true, version: "6.1" },
      storage: {
        ok: true,
        writable: true,
        freeBytes: 10_240,
        minRequiredFreeBytes: 1_024
      }
    });
  });
});
