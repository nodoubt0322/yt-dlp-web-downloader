import type { SystemCheck } from "../apiClient";
import { collectProblems } from "./SystemStatusBanner";

interface SystemStatusPillProps {
  status: SystemCheck | null;
  loading: boolean;
  hasToken: boolean;
}

// Compact mobile readout shown beside the masthead gear, replacing the full status panel.
export function SystemStatusPill({ status, loading, hasToken }: SystemStatusPillProps) {
  const { tone, label } = summarize(status, loading, hasToken);

  return (
    <div className="status-indicator" role="status">
      <span className="status-indicator-label">狀態</span>
      <span className={`status-pill ${tone}`}>{label}</span>
    </div>
  );
}

function summarize(status: SystemCheck | null, loading: boolean, hasToken: boolean) {
  if (!hasToken) {
    return { tone: "neutral", label: "待設定" };
  }
  if (loading) {
    return { tone: "neutral", label: "檢查中" };
  }
  if (!status) {
    return { tone: "warning", label: "無回應" };
  }
  return collectProblems(status).length === 0
    ? { tone: "success", label: "可用" }
    : { tone: "warning", label: "注意" };
}
