import { useState } from "react";
import type { AnalysisResult } from "../apiClient";
import type { QualityPreset } from "../apiClient";

interface VideoMetadataCardProps {
  analysis: AnalysisResult;
  creatingJob: boolean;
  onStartDownload: (qualityPreset: QualityPreset) => void;
}

export function VideoMetadataCard({ analysis, creatingJob, onStartDownload }: VideoMetadataCardProps) {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("bestAvailable");
  const fallbackNotice = getFallbackNotice(qualityPreset, analysis.formatSummary);

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
            <h2 title={analysis.title}>{analysis.title}</h2>
            <p>{analysis.webpageUrl ?? analysis.url}</p>
          </div>
        </div>
        <dl className="metadata-list">
          {typeof analysis.durationSeconds === "number" ? (
            <>
              <dt>長度</dt>
              <dd>長度：{formatDuration(analysis.durationSeconds)}</dd>
            </>
          ) : null}
        </dl>
        <div className="download-controls">
          <label htmlFor="quality-preset">下載品質</label>
          <select
            id="quality-preset"
            value={qualityPreset}
            onChange={(event) => setQualityPreset(event.target.value as QualityPreset)}
          >
            <option value="bestAvailable">原始畫質</option>
            <option value="bestUnder1080p">1080p</option>
            <option value="bestUnder720p">720p</option>
            <option value="bestUnder480p">480p</option>
          </select>
          <button type="button" onClick={() => onStartDownload(qualityPreset)} disabled={creatingJob}>
            {creatingJob ? "建立下載中" : "開始下載"}
          </button>
          {fallbackNotice ? <p className="quality-note">{fallbackNotice}</p> : null}
        </div>
      </div>
    </article>
  );
}

function getFallbackNotice(preset: QualityPreset, summary: AnalysisResult["formatSummary"]) {
  const requestedHeight = getRequestedHeight(preset);
  const availableHeight = typeof summary === "object" && summary ? summary.maxHeight : undefined;

  if (!requestedHeight || typeof availableHeight !== "number" || availableHeight >= requestedHeight) {
    return null;
  }

  return `這支影片沒有 ${requestedHeight}p，會改用可取得的 ${availableHeight}p。`;
}

function getRequestedHeight(preset: QualityPreset) {
  switch (preset) {
    case "bestUnder1080p":
      return 1080;
    case "bestUnder720p":
      return 720;
    case "bestUnder480p":
      return 480;
    default:
      return null;
  }
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}
