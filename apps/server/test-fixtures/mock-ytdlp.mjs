#!/usr/bin/env node

const mode = process.env.YTDLP_MOCK_MODE;
const url = process.argv.at(-1);
const isDownload = process.argv.includes("--progress-template");

if (mode === "timeout" || process.argv.includes("--mock-timeout") || url?.includes("timeout")) {
  setTimeout(() => {}, 60_000);
} else if (mode === "fail" || process.argv.includes("--mock-fail") || url?.includes("fail")) {
  console.error("ERROR: Unsupported URL: /Users/private/video.mp4");
  process.exit(1);
} else if (isDownload && url?.includes("flaky-once")) {
  const homePath = readPath("home:");
  if (!homePath) {
    console.error("ERROR: missing home path");
    process.exit(1);
  }
  const { access, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const marker = join(homePath, ".mock-flaky-once");
  try {
    await access(marker);
  } catch {
    await writeFile(marker, "failed-once");
    console.error("ERROR: transient network failure");
    process.exit(1);
  }
  await writeMockDownload(homePath);
} else if (isDownload) {
  const homePath = readPath("home:");
  if (!homePath) {
    console.error("ERROR: missing home path");
    process.exit(1);
  }
  await writeMockDownload(homePath);
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
      { vcodec: "avc1.640028", acodec: "none", height: 1080, ext: "mp4", filesize: 18_000_000 },
      { vcodec: "avc1.64001f", acodec: "none", height: 720, ext: "mp4", filesize_approx: 10_000_000 },
      { vcodec: "avc1.64001e", acodec: "none", height: 480, ext: "mp4", filesize: 6_000_000 },
      { vcodec: "none", acodec: "mp4a.40.2", ext: "m4a", filesize: 1_000_000, abr: 128 }
    ]
  })}\n`);
}

function readPath(prefix) {
  const paths = process.argv.filter((arg) => arg.startsWith(prefix));
  const value = paths.at(-1);
  return value ? value.slice(prefix.length) : null;
}

async function writeMockDownload(homePath) {
  process.stdout.write('download:{"status":"downloading","downloaded_bytes":6,"total_bytes":12,"speed":2048,"eta":1,"_percent_str":" 50.0%"}\n');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(homePath, { recursive: true });
  await writeFile(join(homePath, "mock-video.mp4"), "mock-content");
  process.stdout.write('download:{"status":"finished","downloaded_bytes":12,"total_bytes":12,"speed":4096,"eta":0,"_percent_str":"100.0%"}\n');
}
