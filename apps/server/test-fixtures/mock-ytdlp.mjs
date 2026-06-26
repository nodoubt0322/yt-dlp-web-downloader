#!/usr/bin/env node

const mode = process.env.YTDLP_MOCK_MODE;
const url = process.argv.at(-1);

if (mode === "timeout" || process.argv.includes("--mock-timeout") || url?.includes("timeout")) {
  setTimeout(() => {}, 60_000);
} else if (mode === "fail" || process.argv.includes("--mock-fail") || url?.includes("fail")) {
  console.error("ERROR: Unsupported URL: /Users/private/video.mp4");
  process.exit(1);
} else {
  process.stdout.write(`${JSON.stringify({
    webpage_url: url,
    original_url: url,
    title: "Fixed Mock Video",
    thumbnail: "https://cdn.example.com/thumb.jpg",
    duration: 125,
    extractor_key: "mock",
    ext: "mp4",
    formats: [
      { vcodec: "avc1.640028", acodec: "none", height: 1080, ext: "mp4" },
      { vcodec: "none", acodec: "mp4a.40.2", ext: "m4a" }
    ]
  })}\n`);
}
