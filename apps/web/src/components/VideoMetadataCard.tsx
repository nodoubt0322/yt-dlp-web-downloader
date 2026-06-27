import { useState } from "react";
import type { AnalysisResult } from "../apiClient";
import type { QualityPreset } from "../apiClient";

interface VideoMetadataCardProps {
  analysis: AnalysisResult;
  creatingJob: boolean;
  onStartDownload: (qualityPreset: QualityPreset) => void;
}

export function VideoMetadataCard({ analysis, creatingJob, onStartDownload }: VideoMetadataCardProps) {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("bestUnder1080p");

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
        <div className="download-controls">
          <label htmlFor="quality-preset">下載品質</label>
          <select
            id="quality-preset"
            value={qualityPreset}
            onChange={(event) => setQualityPreset(event.target.value as QualityPreset)}
          >
            <option value="bestAvailable">最佳可用</option>
            <option value="bestUnder1080p">1080p 以下最佳</option>
            <option value="bestUnder720p">720p 以下最佳</option>
            <option value="bestUnder480p">480p 以下最佳</option>
          </select>
          <button type="button" onClick={() => onStartDownload(qualityPreset)} disabled={creatingJob}>
            {creatingJob ? "建立下載中" : "開始下載"}
          </button>
          <span>優先 mp4，依所選上限建立下載任務。</span>
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
