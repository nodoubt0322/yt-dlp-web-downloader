import { useEffect, useState } from "react";
import type { JobDetails } from "../apiClient";

interface JobProgressCardProps {
  job: JobDetails;
  compact?: boolean;
}

export function JobProgressCard({ job, compact = false }: JobProgressCardProps) {
  const progress = job.progress;
  const percent = typeof progress?.percent === "number" ? Math.round(progress.percent) : null;
  const liveNow = useLiveNow(job.status === "running");
  const processingTime = formatProcessingTime(job, liveNow);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const hasStatusDetails =
    typeof progress?.message === "string" ||
    typeof progress?.speedBytesPerSecond === "number" ||
    typeof progress?.etaSeconds === "number" ||
    (typeof progress?.downloadedBytes === "number" && typeof progress.totalBytes === "number");

  return (
    <article className={compact ? "panel job-card compact-job-card" : "panel job-card"}>
      <div className="panel-heading compact-heading">
        <div className="job-title-line">
          <h2>{headingLabel(job.status)}</h2>
          {job.status === "completed" && job.result ? (
            <div className="result-meta">
              <span className="status-pill success">{formatResultBytes(job.result.size)}</span>
              {job.result.expiresAt ? <span>({formatDateTime(job.result.expiresAt)} 後過期)</span> : null}
            </div>
          ) : null}
        </div>
        <div className="job-heading-actions">
          {processingTime ? (
            <span className="elapsed-time">
              處理時間：<span className="time-value">{processingTime}</span>
            </span>
          ) : null}
          {job.status !== "completed" ? (
            <span className={`status-pill ${statusTone(job.status)}`}>{statusLabel(job.status)}</span>
          ) : null}
        </div>
      </div>
      {job.status !== "completed" && percent !== null ? (
        <div className="progress-block">
          <div className="progress-bar" aria-label="下載進度">
            <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
          <strong>{percent}%</strong>
        </div>
      ) : null}
      {hasStatusDetails ? (
        <div className="status-grid">
          {typeof progress?.message === "string" ? <span className="retry-message">{progress.message}</span> : null}
          {typeof progress?.speedBytesPerSecond === "number" ? <span>速度：{formatBytes(progress.speedBytesPerSecond)}/s</span> : null}
          {typeof progress?.etaSeconds === "number" ? <span>剩餘：約 {formatEta(progress.etaSeconds)}</span> : null}
          {typeof progress?.downloadedBytes === "number" && typeof progress.totalBytes === "number" ? (
            <span>
              已下載：{formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
            </span>
          ) : null}
        </div>
      ) : null}
      {downloadError ? (
        <div className="alert alert-error" role="alert">
          {downloadError}
        </div>
      ) : null}
      {job.status === "completed" && job.result?.downloadUrl ? (
        <a
          className="button-link"
          href={job.result.downloadUrl}
          aria-disabled={downloading}
          onClick={(event) => {
            event.preventDefault();
            void downloadFile(job.result?.downloadUrl ?? "", setDownloadError, setDownloading);
          }}
        >
          {downloading ? "準備下載中" : "下載檔案"}
        </a>
      ) : null}
    </article>
  );
}

async function downloadFile(
  url: string,
  setDownloadError: (message: string | null) => void,
  setDownloading: (downloading: boolean) => void
) {
  if (!url) {
    return;
  }

  setDownloadError(null);
  setDownloading(true);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      setDownloadError(response.status === 410 ? "下載連結已過期，請重新建立下載任務。" : "下載失敗，請稍後再試。");
      return;
    }

    const blob = await response.blob();
    triggerBrowserDownload(blob, readDownloadFilename(response.headers.get("Content-Disposition")));
  } catch {
    setDownloadError("下載失敗，請稍後再試。");
  } finally {
    setDownloading(false);
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function readDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "download.mp4";
  }

  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return "download.mp4";
    }
  }

  return contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? "download.mp4";
}

function statusLabel(status: Exclude<JobDetails["status"], "completed">) {
  switch (status) {
    case "queued":
      return "等待準備";
    case "running":
      return "準備中";
    case "failed":
      return "處理失敗";
    case "expired":
      return "檔案已過期";
  }
}

function headingLabel(status: JobDetails["status"]) {
  return status === "completed" ? "檔案可下載" : "準備檔案中";
}

function statusTone(status: JobDetails["status"]) {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
}

function formatResultBytes(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${Math.round(bytes / 1_000_000_000)}GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)}MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)}KB`;
  }
  return `${bytes}B`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function formatEta(seconds: number) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} 分 ${remainingSeconds} 秒`;
  }
  return `${seconds} 秒`;
}

function useLiveNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
}

function formatProcessingTime(job: JobDetails, liveNow: number) {
  const start = new Date(job.startedAt ?? job.createdAt).getTime();
  const end = getProcessingEnd(job, liveNow);
  if (end === null) {
    return null;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return formatElapsedSeconds(Math.max(0, (end - start) / 1000));
}

function getProcessingEnd(job: JobDetails, liveNow: number) {
  if (job.status === "running") {
    return liveNow;
  }

  const endSource = job.completedAt ?? (job.status === "completed" ? job.updatedAt : null);
  if (!endSource) {
    return null;
  }
  return new Date(endSource).getTime();
}

function formatElapsedSeconds(seconds: number) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds - minutes * 60;
    return `${minutes} 分 ${remainingSeconds.toFixed(1)}秒`;
  }
  return `${seconds.toFixed(1)}秒`;
}
