import { describe, expect, it } from "vitest";
import { normalizeYtDlpError } from "../services/errors.js";

describe("normalizeYtDlpError", () => {
  it.each([
    ["ERROR: Unsupported URL: https://example.invalid", "UNSUPPORTED_URL", false],
    ["ERROR: Sign in to confirm your age. This video may be private", "AUTH_REQUIRED", false],
    ["ERROR: This video is not available in your country", "GEO_RESTRICTED", false],
    ["ERROR: Read timed out while downloading webpage", "NETWORK_TIMEOUT", true],
    ["Process timed out after 3600000ms", "DOWNLOAD_TIMEOUT", true],
    ["ERROR: ffmpeg not found. Please install or provide the path", "FFMPEG_MISSING", false],
    ["ERROR: No space left on device while writing file", "INSUFFICIENT_DISK_SPACE", false],
    ["ERROR: Extractor crashed unexpectedly", "YTDLP_FAILED", true]
  ])("maps %s to %s", (input, code, retryable) => {
    const error = normalizeYtDlpError(input);

    expect(error).toMatchObject({ code, retryable });
    expect(error.message).toBeTruthy();
    expect(error.message).not.toContain("/Users/");
    expect(error.message).not.toContain("Bearer ");
    expect(error.message).not.toContain(" at ");
  });

  it("does not leak stack traces, local paths, or tokens", () => {
    const error = normalizeYtDlpError(`Error: failed for /Users/me/private/video.mp4
    at run (/Users/me/project/src/file.ts:10:2)
    Authorization: Bearer secret-token`);

    expect(error.code).toBe("YTDLP_FAILED");
    expect(error.message).not.toContain("/Users/me");
    expect(error.message).not.toContain("secret-token");
    expect(error.message).not.toContain(" at ");
  });
});
