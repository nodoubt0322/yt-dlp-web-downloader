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
    return <div className="panel status-panel">正在檢查系統狀態...</div>;
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
          {problems.length > 0 ? <p>系統檢查未通過，請查看伺服器設定。</p> : null}
        </div>
        <span className={problems.length === 0 ? "status-pill success" : "status-pill warning"}>
          {problems.length === 0 ? "可用" : "注意"}
        </span>
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

function collectProblems(status: SystemCheck) {
  const problems: string[] = [];
  if (!status.ytDlp.ok) {
    problems.push("影片分析服務目前不可用。");
  }
  if (!status.ffmpeg.ok) {
    problems.push("影片下載服務目前不可用。");
  }
  if (!status.ffprobe.ok) {
    problems.push("媒體資訊檢查目前不可用。");
  }
  return problems;
}
