import { describe, expect, it } from "vitest";
import { parseProgressLine } from "../services/progressParser.js";

describe("parseProgressLine", () => {
  it("normalizes yt-dlp progress-template download JSON lines", () => {
    const progress = parseProgressLine(
      'download:{"status":"downloading","downloaded_bytes":512,"total_bytes":1024,"speed":2048,"eta":3,"_percent_str":" 50.0%"}'
    );

    expect(progress).toEqual({
      phase: "downloading",
      percent: 50,
      downloadedBytes: 512,
      totalBytes: 1024,
      speedBytesPerSecond: 2048,
      etaSeconds: 3
    });
  });

  it("returns indeterminate progress for non-progress or unparseable lines", () => {
    expect(parseProgressLine("[download] Destination: video.mp4")).toEqual({
      phase: "downloading"
    });
    expect(parseProgressLine("download:{not-json")).toEqual({
      phase: "downloading"
    });
  });
});
