import type { JobDetails } from "../apiClient";

interface JobProgressCardProps {
  job: JobDetails;
}

export function JobProgressCard({ job }: JobProgressCardProps) {
  const progress = job.progress;
  const percent = typeof progress?.percent === "number" ? Math.round(progress.percent) : null;

  return (
    <article className="panel job-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">下載狀態</p>
          <h1>{job.title ?? "下載任務"}</h1>
        </div>
        <span className={`status-pill ${statusTone(job.status)}`}>{statusLabel(job.status)}</span>
      </div>
      {percent !== null ? (
        <div className="progress-block">
          <div className="progress-bar" aria-label="下載進度">
            <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
          <strong>{percent}%</strong>
        </div>
      ) : null}
      <div className="status-grid">
        {typeof progress?.speedBytesPerSecond === "number" ? <span>速度：{formatBytes(progress.speedBytesPerSecond)}/s</span> : null}
        {typeof progress?.etaSeconds === "number" ? <span>剩餘：約 {formatEta(progress.etaSeconds)}</span> : null}
        {typeof progress?.downloadedBytes === "number" && typeof progress.totalBytes === "number" ? (
          <span>
            已下載：{formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function statusLabel(status: JobDetails["status"]) {
  switch (status) {
    case "queued":
      return "等待下載開始";
    case "running":
      return "下載進行中";
    case "completed":
      return "下載完成";
    case "failed":
      return "下載失敗";
    case "canceled":
      return "下載已取消";
    case "expired":
      return "檔案已過期";
  }
}

function statusTone(status: JobDetails["status"]) {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "expired":
      return "danger";
    case "canceled":
      return "warning";
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

function formatEta(seconds: number) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} 分 ${remainingSeconds} 秒`;
  }
  return `${seconds} 秒`;
}
