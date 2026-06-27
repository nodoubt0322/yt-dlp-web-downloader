import { ApiError, type PublicError } from "../apiClient";

type ErrorContext = "analyze" | "job";

export function messageForError(error: unknown, context: ErrorContext) {
  const code = readCode(error);
  if (code) {
    return messageForCode(code, context);
  }
  return context === "analyze" ? "分析失敗，請稍後再試。" : "下載失敗，請稍後再試。";
}

function readCode(error: unknown) {
  if (error instanceof ApiError) {
    return error.code;
  }
  if (error && typeof error === "object" && typeof (error as Partial<PublicError>).code === "string") {
    return (error as PublicError).code;
  }
  return null;
}

function messageForCode(code: string, context: ErrorContext) {
  switch (code) {
    case "UNSAFE_URL":
    case "UNSUPPORTED_URL":
      return "不支援或不允許使用這個網址。";
    case "AUTH_REQUIRED":
      return "影片需要登入、權限或額外驗證，無法下載。";
    case "GEO_RESTRICTED":
      return "影片受到地區限制，無法下載。";
    case "NETWORK_TIMEOUT":
      return "網路連線逾時，請稍後再試。";
    case "ANALYZE_TIMEOUT":
      return "分析處理逾時，請稍後再試。";
    case "DOWNLOAD_TIMEOUT":
      return "下載處理逾時，請稍後再試。";
    case "FFMPEG_MISSING":
      return "伺服器影片處理工具未就緒，無法完成影片合併。";
    case "INSUFFICIENT_DISK_SPACE":
      return "伺服器磁碟空間不足，無法儲存檔案。";
    case "JOB_NOT_FOUND":
      return "找不到這個下載任務。";
    default:
      return context === "analyze" ? "分析失敗，請稍後再試。" : "下載失敗，請稍後再試。";
  }
}
