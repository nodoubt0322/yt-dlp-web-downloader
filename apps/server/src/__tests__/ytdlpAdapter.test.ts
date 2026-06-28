import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithYtDlp } from "../services/ytdlpAdapter.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const mockYtDlp = resolve(testDir, "../../test-fixtures/mock-ytdlp.mjs");
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("analyzeWithYtDlp", () => {
  it("runs yt-dlp with analyze args and normalizes one JSON metadata object", async () => {
    await chmod(mockYtDlp, 0o755);

    const metadata = await analyzeWithYtDlp({
      url: "https://example.com/watch?v=123",
      ytDlpBinary: mockYtDlp,
      timeoutMs: 1_000
    });

    expect(metadata).toEqual({
      url: "https://example.com/watch?v=123",
      title: "Fixed Mock Video",
      thumbnail: "https://cdn.example.com/thumb.jpg",
      durationSeconds: 125,
      extractor: "mock",
      webpageUrl: "https://example.com/watch?v=123",
      recommendedOptions: {
        qualityPreset: "bestAvailable"
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
  });

  it("maps analyze process timeouts to ANALYZE_TIMEOUT", async () => {
    await chmod(mockYtDlp, 0o755);

    await expect(
      analyzeWithYtDlp({
        url: "https://example.com/watch?v=timeout",
        ytDlpBinary: mockYtDlp,
        timeoutMs: 25,
        env: { YTDLP_MOCK_MODE: "timeout" }
      })
    ).rejects.toMatchObject({
      code: "ANALYZE_TIMEOUT",
      retryable: true
    });
  });

  it("returns normalized client-safe failures without stderr path leakage", async () => {
    await chmod(mockYtDlp, 0o755);
    const logDir = await mkdtemp(join(tmpdir(), "yt-dlp-analyze-log-"));
    tempDirs.push(logDir);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      analyzeWithYtDlp({
        url: "https://example.com/watch?v=fail",
        ytDlpBinary: mockYtDlp,
        timeoutMs: 1_000,
        env: { YTDLP_MOCK_MODE: "fail" },
        logDir
      })
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
      retryable: false
    });

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[yt-dlp analyze failed] exitCode=1"));
    const terminalOutput = consoleError.mock.calls.flat().join("\n");
    expect(terminalOutput).toContain("log=");
    expect(terminalOutput).not.toContain("ERROR: Unsupported URL");
    expect(terminalOutput).not.toContain("/Users/private/video.mp4");

    const log = await readFile(join(logDir, "yt-dlp-analyze.log"), "utf8");
    expect(log).toContain("ERROR: Unsupported URL: /Users/private/video.mp4");
  });
});
