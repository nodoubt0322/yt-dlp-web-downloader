import type { SystemCheck } from "../apiClient";

interface SystemStatusBannerProps {
  status: SystemCheck | null;
  loading: boolean;
  hasToken: boolean;
}

export function SystemStatusBanner({ status, loading, hasToken }: SystemStatusBannerProps) {
  if (!hasToken) {
    return <div className="alert alert-neutral">請先輸入管理 Token，才能檢查系統狀態與送出下載任務。</div>;
  }

  if (loading) {
    return <div className="alert alert-neutral">正在檢查 yt-dlp、ffmpeg 與儲存空間...</div>;
  }

  if (!status) {
    return <div className="alert alert-warning">尚未取得系統狀態，請確認 Token 後重試。</div>;
  }

  const problems = collectProblems(status);
  if (problems.length === 0) {
    return <div className="alert alert-success">系統依賴檢查正常，可以開始分析網址。</div>;
  }

  return (
    <div className="alert alert-warning" role="status">
      {problems.map((problem) => (
        <div key={problem}>{problem}</div>
      ))}
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

