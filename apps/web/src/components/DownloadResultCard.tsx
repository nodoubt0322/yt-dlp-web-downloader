import type { JobResult } from "../apiClient";

interface DownloadResultCardProps {
  result: JobResult;
}

export function DownloadResultCard({ result }: DownloadResultCardProps) {
  return (
    <article className="panel result-card">
      <div className="panel-heading compact-heading">
        <div>
          <h2>檔案已準備好</h2>
          <p>{result.fileName}</p>
        </div>
        <span className="status-pill success">{formatBytes(result.size)}</span>
      </div>
      {result.downloadUrl ? (
        <a className="button-link" href={result.downloadUrl}>
          下載檔案
        </a>
      ) : null}
      {result.expiresAt ? <p className="muted">檔案會在 {formatDateTime(result.expiresAt)} 後過期，請盡快下載。</p> : null}
    </article>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${Math.round(bytes / 1_000_000_000)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
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
