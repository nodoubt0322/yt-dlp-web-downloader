#!/usr/bin/env node

const mode = process.env.YTDLP_MOCK_MODE;
const url = process.argv.at(-1);
const isDownload = process.argv.includes("--progress-template");

if (mode === "timeout" || process.argv.includes("--mock-timeout") || url?.includes("timeout")) {
  setTimeout(() => {}, 60_000);
} else if (mode === "fail" || process.argv.includes("--mock-fail") || url?.includes("fail")) {
  console.error("ERROR: Unsupported URL: /Users/private/video.mp4");
  process.exit(1);
} else if (isDownload) {
  const homePath = readPath("home:");
  if (!homePath) {
    console.error("ERROR: missing home path");
    process.exit(1);
  }
  process.stdout.write('download:{"status":"downloading","downloaded_bytes":6,"total_bytes":12,"speed":2048,"eta":1,"_percent_str":" 50.0%"}\n');
  setTimeout(async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(homePath, { recursive: true });
    await writeFile(join(homePath, "mock-video.mp4"), "mock-content");
    process.stdout.write('download:{"status":"finished","downloaded_bytes":12,"total_bytes":12,"speed":4096,"eta":0,"_percent_str":"100.0%"}\n');
  }, 50);
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

function readPath(prefix) {
  const paths = process.argv.filter((arg) => arg.startsWith(prefix));
  const value = paths.at(-1);
  return value ? value.slice(prefix.length) : null;
}
