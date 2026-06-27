#!/usr/bin/env node

const args = process.argv.slice(2);
const outputPath = args.at(-1);
const inputPath = args.at(args.indexOf("-i") + 1);

if (!inputPath || !outputPath) {
  console.error("ERROR: missing input or output path");
  process.exit(1);
}

if (process.env.FFMPEG_MOCK_MODE === "fail" || inputPath.includes("ffmpeg-fail")) {
  console.error("ERROR: ffmpeg optimization failed");
  process.exit(1);
}

const { readFile, writeFile } = await import("node:fs/promises");

const source = await readFile(inputPath);
const output = process.env.FFMPEG_MOCK_MODE === "larger" ? Buffer.concat([source, Buffer.from("-larger")]) : Buffer.from("small");
await new Promise((resolve) => setTimeout(resolve, 50));
await writeFile(outputPath, output);
