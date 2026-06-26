import { resolve } from "node:path";

export interface AppConfig {
  port: number;
  publicBaseUrl?: string;
  dataDir: string;
  adminToken?: string;
  jobConcurrency: number;
  analyzeTimeoutMs: number;
  downloadTimeoutMs: number;
  fileTtlHours: number;
  cleanupIntervalMs: number;
  minFreeDiskBytes: number;
  rateLimitAnalyzePerMinute: number;
  rateLimitJobCreatePerMinute: number;
  enableSse: boolean;
  enableRangeRequests: boolean;
  ytDlpBinary: string;
  ffmpegBinary: string;
  ffprobeBinary: string;
}

export type ConfigInput = Record<string, string | undefined>;

const DEFAULTS = {
  port: 8787,
  jobConcurrency: 1,
  analyzeTimeoutSeconds: 60,
  downloadTimeoutSeconds: 2 * 60 * 60,
  fileTtlHours: 24,
  cleanupIntervalMinutes: 60,
  minFreeDiskBytes: 5 * 1024 * 1024 * 1024,
  rateLimitAnalyzePerMinute: 10,
  rateLimitJobCreatePerMinute: 5,
  ytDlpBinary: "yt-dlp",
  ffmpegBinary: "ffmpeg",
  ffprobeBinary: "ffprobe"
};

export function loadConfig(env: ConfigInput = process.env): AppConfig {
  const adminToken = normalizeOptional(env.ADMIN_TOKEN);

  if (env.NODE_ENV === "production" && !adminToken) {
    throw new Error("ADMIN_TOKEN is required in production");
  }

  return {
    port: readNumber(env.PORT, "PORT", DEFAULTS.port),
    publicBaseUrl: normalizeOptional(env.PUBLIC_BASE_URL),
    dataDir: resolve(env.DATA_DIR ?? "data"),
    adminToken,
    jobConcurrency: readNumber(env.JOB_CONCURRENCY, "JOB_CONCURRENCY", DEFAULTS.jobConcurrency),
    analyzeTimeoutMs:
      readNumber(env.ANALYZE_TIMEOUT_SECONDS, "ANALYZE_TIMEOUT_SECONDS", DEFAULTS.analyzeTimeoutSeconds) * 1000,
    downloadTimeoutMs:
      readNumber(env.DOWNLOAD_TIMEOUT_SECONDS, "DOWNLOAD_TIMEOUT_SECONDS", DEFAULTS.downloadTimeoutSeconds) * 1000,
    fileTtlHours: readNumber(env.FILE_TTL_HOURS, "FILE_TTL_HOURS", DEFAULTS.fileTtlHours),
    cleanupIntervalMs:
      readNumber(env.CLEANUP_INTERVAL_MINUTES, "CLEANUP_INTERVAL_MINUTES", DEFAULTS.cleanupIntervalMinutes) * 60_000,
    minFreeDiskBytes: readNumber(env.MIN_FREE_DISK_BYTES, "MIN_FREE_DISK_BYTES", DEFAULTS.minFreeDiskBytes),
    rateLimitAnalyzePerMinute: readNumber(
      env.RATE_LIMIT_ANALYZE_PER_MINUTE,
      "RATE_LIMIT_ANALYZE_PER_MINUTE",
      DEFAULTS.rateLimitAnalyzePerMinute
    ),
    rateLimitJobCreatePerMinute: readNumber(
      env.RATE_LIMIT_JOB_CREATE_PER_MINUTE,
      "RATE_LIMIT_JOB_CREATE_PER_MINUTE",
      DEFAULTS.rateLimitJobCreatePerMinute
    ),
    enableSse: readBoolean(env.ENABLE_SSE),
    enableRangeRequests: readBoolean(env.ENABLE_RANGE_REQUESTS),
    ytDlpBinary: env.YT_DLP_BINARY ?? DEFAULTS.ytDlpBinary,
    ffmpegBinary: env.FFMPEG_BINARY ?? DEFAULTS.ffmpegBinary,
    ffprobeBinary: env.FFPROBE_BINARY ?? DEFAULTS.ffprobeBinary
  };
}

export function mergeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig(),
    ...overrides
  };
}

function readNumber(value: string | undefined, key: string, fallback: number) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }

  return parsed;
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readBoolean(value: string | undefined) {
  return value === "true";
}
