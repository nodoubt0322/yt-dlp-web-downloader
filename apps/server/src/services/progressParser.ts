import type { JobProgress } from "./types.js";

export function parseProgressLine(line: string): JobProgress {
  if (!line.startsWith("download:")) {
    return { phase: "downloading" };
  }

  try {
    const raw = JSON.parse(line.slice("download:".length)) as Record<string, unknown>;
    return {
      phase: "downloading",
      ...readPercent(raw),
      ...readNumberField(raw.downloaded_bytes, "downloadedBytes" as const),
      ...readNumberField(raw.total_bytes ?? raw.total_bytes_estimate, "totalBytes" as const),
      ...readNumberField(raw.speed, "speedBytesPerSecond" as const),
      ...readNumberField(raw.eta, "etaSeconds" as const)
    };
  } catch {
    return { phase: "downloading" };
  }
}

function readPercent(raw: Record<string, unknown>): Pick<JobProgress, "percent"> {
  if (typeof raw.percent === "number" && Number.isFinite(raw.percent)) {
    return { percent: clamp(raw.percent) };
  }

  if (typeof raw._percent_str === "string") {
    const parsed = Number(raw._percent_str.replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      return { percent: clamp(parsed) };
    }
  }

  return {};
}

function readNumberField(value: unknown, key: keyof JobProgress): JobProgress {
  return typeof value === "number" && Number.isFinite(value) ? { [key]: value } : {};
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
