import { buildAnalyzeArgs } from "./commandBuilder.js";
import { normalizeYtDlpError, type NormalizedYtDlpError } from "./errors.js";
import { ProcessRunnerError, runProcess } from "./processRunner.js";

export interface NormalizedVideoMetadata {
  url: string;
  title: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  extractor: string | null;
  webpageUrl: string | null;
  recommendedOptions: {
    qualityPreset: "bestAvailable";
  };
  formatSummary: {
    hasVideo: boolean;
    hasAudio: boolean;
    maxHeight: number | null;
    ext: string | null;
    qualityEstimates: Array<{
      preset: "bestAvailable" | "bestUnder1080p" | "bestUnder720p" | "bestUnder480p";
      height: number | null;
      sizeBytes: number;
      approximate: boolean;
    }>;
  };
}

export interface AnalyzeWithYtDlpOptions {
  url: string;
  ytDlpBinary: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}

export async function analyzeWithYtDlp(options: AnalyzeWithYtDlpOptions): Promise<NormalizedVideoMetadata> {
  try {
    const result = await runProcess(options.ytDlpBinary, buildAnalyzeArgs(options.url), {
      timeoutMs: options.timeoutMs,
      env: options.env
    });
    return normalizeMetadata(parseSingleJsonObject(result.stdout), options.url);
  } catch (error) {
    logAnalyzeFailure(error);
    throw normalizeAnalyzeError(error);
  }
}

function parseSingleJsonObject(stdout: string) {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected one JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw normalizeYtDlpError("yt-dlp returned invalid JSON metadata");
  }
}

function normalizeMetadata(raw: Record<string, unknown>, fallbackUrl: string): NormalizedVideoMetadata {
  const formats = Array.isArray(raw.formats) ? raw.formats.filter(isRecord) : [];
  const videoFormats = formats.filter((format) => readString(format.vcodec) !== "none");
  const audioFormats = formats.filter((format) => readString(format.acodec) !== "none");
  const heights = videoFormats.map((format) => readNumber(format.height)).filter((height) => height !== null);

  return {
    url: readString(raw.original_url) ?? readString(raw.webpage_url) ?? fallbackUrl,
    title: readString(raw.title),
    thumbnail: readString(raw.thumbnail),
    durationSeconds: readNumber(raw.duration),
    extractor: readString(raw.extractor_key) ?? readString(raw.extractor),
    webpageUrl: readString(raw.webpage_url),
    recommendedOptions: {
      qualityPreset: "bestAvailable"
    },
    formatSummary: {
      hasVideo: videoFormats.length > 0,
      hasAudio: audioFormats.length > 0,
      maxHeight: heights.length > 0 ? Math.max(...heights) : null,
      ext: readString(raw.ext) ?? readString(videoFormats[0]?.ext),
      qualityEstimates: buildQualityEstimates(videoFormats, audioFormats)
    }
  };
}

function buildQualityEstimates(videoFormats: Record<string, unknown>[], audioFormats: Record<string, unknown>[]) {
  const bestAudio = audioFormats
    .map((format) => ({ format, size: readFormatSize(format), bitrate: readNumber(format.abr) ?? readNumber(format.tbr) ?? 0 }))
    .filter((item): item is { format: Record<string, unknown>; size: FormatSize; bitrate: number } => item.size !== null)
    .sort((a, b) => b.bitrate - a.bitrate)[0];

  return [
    buildQualityEstimate("bestAvailable", null, videoFormats, bestAudio),
    buildQualityEstimate("bestUnder1080p", 1080, videoFormats, bestAudio),
    buildQualityEstimate("bestUnder720p", 720, videoFormats, bestAudio),
    buildQualityEstimate("bestUnder480p", 480, videoFormats, bestAudio)
  ].filter((estimate) => estimate !== null);
}

function buildQualityEstimate(
  preset: "bestAvailable" | "bestUnder1080p" | "bestUnder720p" | "bestUnder480p",
  maxHeight: number | null,
  videoFormats: Record<string, unknown>[],
  bestAudio: { size: FormatSize } | undefined
) {
  const candidates = videoFormats
    .map((format) => ({ format, height: readNumber(format.height), size: readFormatSize(format) }))
    .filter((item) => item.height !== null && item.size !== null)
    .filter((item) => maxHeight === null || item.height! <= maxHeight)
    .sort((a, b) => b.height! - a.height!);
  const selected = candidates[0];
  if (!selected?.size) {
    return null;
  }

  const audioBytes = bestAudio?.size.bytes ?? 0;
  return {
    preset,
    height: selected.height,
    sizeBytes: selected.size.bytes + audioBytes,
    approximate: selected.size.approximate || Boolean(bestAudio?.size.approximate)
  };
}

interface FormatSize {
  bytes: number;
  approximate: boolean;
}

function readFormatSize(format: Record<string, unknown>): FormatSize | null {
  const exact = readNumber(format.filesize);
  if (exact !== null && exact > 0) {
    return { bytes: exact, approximate: false };
  }
  const approximate = readNumber(format.filesize_approx);
  if (approximate !== null && approximate > 0) {
    return { bytes: approximate, approximate: true };
  }
  return null;
}

function normalizeAnalyzeError(error: unknown): NormalizedYtDlpError {
  if (error instanceof ProcessRunnerError && error.timedOut) {
    return {
      code: "ANALYZE_TIMEOUT",
      message: "分析處理逾時，請稍後再試。",
      retryable: true
    };
  }

  if (isNormalizedError(error)) {
    return error;
  }

  if (error instanceof ProcessRunnerError) {
    return normalizeYtDlpError(`${error.message}\n${error.stderr}\n${error.stdout}`);
  }

  return normalizeYtDlpError(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNormalizedError(value: unknown): value is NormalizedYtDlpError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function logAnalyzeFailure(error: unknown) {
  if (!(error instanceof ProcessRunnerError)) {
    return;
  }

  console.error(`[yt-dlp analyze failed] exitCode=${error.exitCode ?? "unknown"} timedOut=${error.timedOut}`);
  if (error.stderr.trim()) {
    console.error(`[yt-dlp stderr]\n${error.stderr.trim()}`);
    return;
  }
  if (error.stdout.trim()) {
    console.error(`[yt-dlp stdout]\n${error.stdout.trim().slice(0, 2000)}`);
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
