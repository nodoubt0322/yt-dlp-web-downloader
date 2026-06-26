import type { JobResult } from "../apiClient";

interface DownloadResultCardProps {
  result: JobResult;
}

export function DownloadResultCard({ result }: DownloadResultCardProps) {
  return (
    <article className="panel result-card">
      <h2>檔案已準備好</h2>
      <p>{result.fileName}</p>
      {result.downloadUrl ? (
        <a className="button-link" href={result.downloadUrl}>
          下載檔案
        </a>
      ) : null}
      {result.expiresAt ? <p className="muted">檔案會在 {formatDateTime(result.expiresAt)} 後過期，請盡快下載。</p> : null}
    </article>
  );
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

