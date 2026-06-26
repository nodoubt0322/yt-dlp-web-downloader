import type { SystemCheck } from "../apiClient";

interface SystemStatusBannerProps {
  status: SystemCheck | null;
  loading: boolean;
  hasToken: boolean;
}

export function SystemStatusBanner({ status, loading, hasToken }: SystemStatusBannerProps) {
  if (!hasToken) {
    return <div className="panel status-panel">請先輸入管理 Token，才能檢查系統狀態與送出下載任務。</div>;
  }

  if (loading) {
    return <div className="panel status-panel">正在檢查 yt-dlp、ffmpeg 與儲存空間...</div>;
  }

  if (!status) {
    return <div className="panel status-panel warning">尚未取得系統狀態，請確認 Token 後重試。</div>;
  }

  const problems = collectProblems(status);

  return (
    <section className={problems.length === 0 ? "panel status-panel success" : "panel status-panel warning"} role="status">
      <div className="panel-heading compact-heading">
        <div>
          <h2>系統狀態</h2>
          <p>{problems.length === 0 ? "依賴檢查正常，可以開始分析網址。" : "需要處理下列項目。"}</p>
        </div>
        <span className={problems.length === 0 ? "status-pill success" : "status-pill warning"}>
          {problems.length === 0 ? "可用" : "注意"}
        </span>
      </div>
      <div className="dependency-grid" aria-label="依賴檢查結果">
        <DependencyItem label="yt-dlp" ok={status.ytDlp.ok} version={status.ytDlp.version} />
        <DependencyItem label="ffmpeg" ok={status.ffmpeg.ok} version={status.ffmpeg.version} />
        <DependencyItem label="ffprobe" ok={status.ffprobe.ok} version={status.ffprobe.version} />
        <DependencyItem label="storage" ok={status.storage.ok} version={formatBytes(status.storage.freeBytes)} />
      </div>
      {problems.length > 0 ? (
        <div className="problem-list">
          {problems.map((problem) => (
            <div key={problem}>{problem}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DependencyItem({ label, ok, version }: { label: string; ok: boolean; version: string | null }) {
  return (
    <div className="dependency-item">
      <span className={ok ? "dot ok" : "dot bad"} />
      <span>{label}</span>
      <small>{version ?? "未偵測"}</small>
    </div>
  );
}

function collectProblems(status: SystemCheck) {
  const problems: string[] = [];
  if (!status.ytDlp.ok) {
    problems.push("yt-dlp 無法使用，請先確認伺服器設定。");
  }
  if (!status.ffmpeg.ok) {
    problems.push("ffmpeg 無法使用，完成下載可能會失敗。");
  }
  if (!status.ffprobe.ok) {
    problems.push("ffprobe 無法使用，媒體資訊檢查可能會失敗。");
  }
  if (!status.storage.ok) {
    problems.push("儲存空間目前不可寫入或容量不足。");
  }
  return problems;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${Math.round(bytes / 1_000_000_000)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  return `${Math.round(bytes / 1_000)} KB`;
}
