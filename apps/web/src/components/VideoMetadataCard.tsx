import type { AnalysisResult } from "../apiClient";

interface VideoMetadataCardProps {
  analysis: AnalysisResult;
  creatingJob: boolean;
  onStartDownload: () => void;
}

export function VideoMetadataCard({ analysis, creatingJob, onStartDownload }: VideoMetadataCardProps) {
  return (
    <article className="panel metadata-card">
      {analysis.thumbnail ? (
        <img className="thumbnail" src={analysis.thumbnail} alt={`${analysis.title} 縮圖`} />
      ) : (
        <div className="thumbnail placeholder">無縮圖</div>
      )}
      <div className="metadata-body">
        <div className="panel-heading compact-heading">
          <div>
            <h2>{analysis.title}</h2>
            <p>{analysis.webpageUrl ?? analysis.url}</p>
          </div>
          <span className="status-pill neutral">已分析</span>
        </div>
        <dl className="metadata-list">
          {analysis.extractor ? (
            <>
              <dt>來源</dt>
              <dd>來源：{analysis.extractor}</dd>
            </>
          ) : null}
          {typeof analysis.durationSeconds === "number" ? (
            <>
              <dt>長度</dt>
              <dd>長度：{formatDuration(analysis.durationSeconds)}</dd>
            </>
          ) : null}
          {formatSummaryLabel(analysis.formatSummary) ? (
            <>
              <dt>格式</dt>
              <dd>{formatSummaryLabel(analysis.formatSummary)}</dd>
            </>
          ) : null}
        </dl>
        <div className="action-row">
          <button type="button" onClick={onStartDownload} disabled={creatingJob}>
            {creatingJob ? "建立下載中" : "開始下載預設品質"}
          </button>
          <span>預設：1080p 以下最佳品質，優先 mp4。</span>
        </div>
      </div>
    </article>
  );
}

function formatSummaryLabel(summary: AnalysisResult["formatSummary"]) {
  if (!summary) {
    return null;
  }

  const parts: string[] = [];
  if (summary.ext) {
    parts.push(summary.ext);
  }
  if (typeof summary.maxHeight === "number") {
    parts.push(`最高 ${summary.maxHeight}p`);
  }
  if (summary.hasVideo && summary.hasAudio) {
    parts.push("含影像與音訊");
  } else if (summary.hasVideo) {
    parts.push("含影像");
  } else if (summary.hasAudio) {
    parts.push("含音訊");
  }

  return parts.length > 0 ? `格式：${parts.join("，")}` : null;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
