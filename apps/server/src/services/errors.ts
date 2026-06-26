export type NormalizedErrorCode =
  | "UNSUPPORTED_URL"
  | "AUTH_REQUIRED"
  | "GEO_RESTRICTED"
  | "NETWORK_TIMEOUT"
  | "DOWNLOAD_TIMEOUT"
  | "FFMPEG_MISSING"
  | "INSUFFICIENT_DISK_SPACE"
  | "YTDLP_FAILED";

export interface NormalizedYtDlpError {
  code: NormalizedErrorCode;
  message: string;
  retryable: boolean;
}

const ERROR_DEFINITIONS: Record<NormalizedErrorCode, NormalizedYtDlpError> = {
  UNSUPPORTED_URL: {
    code: "UNSUPPORTED_URL",
    message: "不支援或無法解析這個網址。",
    retryable: false
  },
  AUTH_REQUIRED: {
    code: "AUTH_REQUIRED",
    message: "影片需要登入、權限或額外驗證。",
    retryable: false
  },
  GEO_RESTRICTED: {
    code: "GEO_RESTRICTED",
    message: "影片受到地區限制，無法下載。",
    retryable: false
  },
  NETWORK_TIMEOUT: {
    code: "NETWORK_TIMEOUT",
    message: "網路連線逾時，請稍後再試。",
    retryable: true
  },
  DOWNLOAD_TIMEOUT: {
    code: "DOWNLOAD_TIMEOUT",
    message: "下載處理逾時，請稍後再試。",
    retryable: true
  },
  FFMPEG_MISSING: {
    code: "FFMPEG_MISSING",
    message: "伺服器缺少 ffmpeg，無法合併影片。",
    retryable: false
  },
  INSUFFICIENT_DISK_SPACE: {
    code: "INSUFFICIENT_DISK_SPACE",
    message: "伺服器磁碟空間不足，無法儲存檔案。",
    retryable: false
  },
  YTDLP_FAILED: {
    code: "YTDLP_FAILED",
    message: "yt-dlp 執行失敗，請稍後再試。",
    retryable: true
  }
};

export function normalizeYtDlpError(error: unknown): NormalizedYtDlpError {
  const text = errorToText(error);
  const code = classifyError(text);
  return { ...ERROR_DEFINITIONS[code] };
}

function errorToText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
  }

  return String(error);
}

function classifyError(text: string): NormalizedErrorCode {
  const normalized = text.toLowerCase();

  if (/unsupported url|invalid url|no suitable extractor/.test(normalized)) {
    return "UNSUPPORTED_URL";
  }

  if (/sign in|login|private video|password|confirm your age|authentication/.test(normalized)) {
    return "AUTH_REQUIRED";
  }

  if (/not available in your country|geo.?restricted|geoblock|region/.test(normalized)) {
    return "GEO_RESTRICTED";
  }

  if (/process timed out|download timed out|timeout after|timed out after/.test(normalized)) {
    return "DOWNLOAD_TIMEOUT";
  }

  if (/read timed out|connection timed out|network.*timeout|temporary failure|econnreset|enotfound/.test(normalized)) {
    return "NETWORK_TIMEOUT";
  }

  if (/ffmpeg.*not found|ffmpeg is not installed|unable to locate ffmpeg/.test(normalized)) {
    return "FFMPEG_MISSING";
  }

  if (/no space left on device|enospc|disk full|insufficient disk/.test(normalized)) {
    return "INSUFFICIENT_DISK_SPACE";
  }

  return "YTDLP_FAILED";
}
