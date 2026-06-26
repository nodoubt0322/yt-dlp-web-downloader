import { describe, expect, it } from "vitest";
import { buildAnalyzeArgs, buildDownloadArgs } from "../services/commandBuilder.js";

describe("commandBuilder", () => {
  it("builds analyze arguments without shell strings or output paths", () => {
    const url = "https://example.com/watch?v=123";

    const args = buildAnalyzeArgs(url);

    expect(args).toEqual(["--dump-json", "--no-playlist", "--no-warnings", "--", url]);
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
      outputTemplate: "%(title).200B-%(id)s.%(ext)s"
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
});
