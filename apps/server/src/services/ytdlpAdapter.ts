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
    qualityPreset: "bestUnder1080p";
    preferMp4: true;
  };
  formatSummary: {
    hasVideo: boolean;
    hasAudio: boolean;
    maxHeight: number | null;
    ext: string | null;
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
      qualityPreset: "bestUnder1080p",
      preferMp4: true
    },
    formatSummary: {
      hasVideo: videoFormats.length > 0,
      hasAudio: audioFormats.length > 0,
      maxHeight: heights.length > 0 ? Math.max(...heights) : null,
      ext: readString(raw.ext) ?? readString(videoFormats[0]?.ext)
    }
  };
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
