import { describe, expect, it } from "vitest";
import { buildAnalyzeArgs, buildDownloadArgs, buildOptimizeVideoArgs } from "../services/commandBuilder.js";

describe("commandBuilder", () => {
  it("builds analyze arguments without shell strings or output paths", () => {
    const url = "https://example.com/watch?v=123";

    const args = buildAnalyzeArgs(url);

    expect(args).toEqual(["--dump-json", "--no-playlist", "--playlist-items", "1", "--no-warnings", "--", url]);
    expect(args).toContain("--playlist-items");
    expect(args).not.toContain("-o");
    expect(args).not.toContain("--paths");
    expect(typeof args).not.toBe("string");
  });

  it("builds download arguments with controlled paths and URL after --", () => {
    const url = "https://example.com/watch?v=123";
    const args = buildDownloadArgs({
      url,
      homePath: "/srv/data/jobs/job-1",
      tempPath: "/srv/data/tmp/job-1",
      outputTemplate: "%(title).200B-%(id)s.%(ext)s",
      qualityPreset: "bestUnder1080p"
    });

    expect(typeof args).not.toBe("string");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--newline");
    expect(args).toContain("--progress-template");
    expect(args).toContain("download:%(progress)j");
    expect(args).toContain("-S");
    expect(args).toContain("res:1080");
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("mp4");
    expect(args).toContain("--paths");
    expect(args).toContain("home:/srv/data/jobs/job-1");
    expect(args).toContain("temp:/srv/data/tmp/job-1");
    expect(args).toContain("-o");
    expect(args).toContain("%(title).200B-%(id)s.%(ext)s");
    expect(args.slice(-2)).toEqual(["--", url]);
  });

  it("maps lower quality presets to the selected yt-dlp resolution sort", () => {
    const args = buildDownloadArgs({
      url: "https://example.com/watch?v=123",
      homePath: "/srv/data/jobs/job-1",
      tempPath: "/srv/data/tmp/job-1",
      outputTemplate: "%(title).200B-%(id)s.%(ext)s",
      qualityPreset: "bestUnder720p"
    });

    expect(args).toContain("res:720");
  });

  it("builds ffmpeg optimization arguments for smaller compatible mp4 output", () => {
    const args = buildOptimizeVideoArgs({
      inputPath: "/srv/data/jobs/job-1/source.mp4",
      outputPath: "/srv/data/jobs/job-1/source.optimized.mp4"
    });

    expect(args).toEqual([
      "-y",
      "-i",
      "/srv/data/jobs/job-1/source.mp4",
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "/srv/data/jobs/job-1/source.optimized.mp4"
    ]);
  });
});
