import { chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithYtDlp } from "../services/ytdlpAdapter.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const mockYtDlp = resolve(testDir, "../../test-fixtures/mock-ytdlp.mjs");

afterEach(() => {
  vi.restoreAllMocks();
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
        qualityPreset: "bestUnder1080p",
        preferMp4: true
      },
      formatSummary: {
        hasVideo: true,
        hasAudio: true,
        maxHeight: 1080,
        ext: "mp4"
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      analyzeWithYtDlp({
        url: "https://example.com/watch?v=fail",
        ytDlpBinary: mockYtDlp,
        timeoutMs: 1_000,
        env: { YTDLP_MOCK_MODE: "fail" }
      })
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
      retryable: false
    });

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[yt-dlp analyze failed] exitCode=1"));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("ERROR: Unsupported URL"));
  });
});
