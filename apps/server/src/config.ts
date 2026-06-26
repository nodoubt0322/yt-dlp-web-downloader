import { resolve } from "node:path";

export interface AppConfig {
  port: number;
  dataDir: string;
  adminToken?: string;
  analyzeTimeoutMs: number;
  downloadTimeoutMs: number;
  fileTtlHours: number;
  cleanupIntervalMs: number;
  minFreeDiskBytes: number;
  rateLimitAnalyzePerMinute: number;
  rateLimitJobCreatePerMinute: number;
  ytDlpBinary: string;
  ffmpegBinary: string;
  ffprobeBinary: string;
}

export type ConfigInput = Record<string, string | undefined>;

const DEFAULTS = {
  port: 8787,
  analyzeTimeoutSeconds: 60,
  downloadTimeoutSeconds: 60 * 60,
  fileTtlHours: 24,
  cleanupIntervalMinutes: 15,
  minFreeDiskBytes: 1024 * 1024 * 1024,
  rateLimitAnalyzePerMinute: 20,
  rateLimitJobCreatePerMinute: 10,
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
    dataDir: resolve(env.DATA_DIR ?? "data"),
    adminToken,
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
