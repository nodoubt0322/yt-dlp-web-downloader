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
        <h2>{analysis.title}</h2>
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
          {analysis.formatSummary ? (
            <>
              <dt>格式</dt>
              <dd>{analysis.formatSummary}</dd>
            </>
          ) : null}
        </dl>
        <button type="button" onClick={onStartDownload} disabled={creatingJob}>
          {creatingJob ? "建立下載中" : "開始下載預設品質"}
        </button>
      </div>
    </article>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

