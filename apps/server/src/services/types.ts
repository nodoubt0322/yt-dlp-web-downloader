export type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled" | "expired";

export interface JobProgress {
  phase?: string;
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
}

export interface JobResult {
  fileName: string;
  size: number;
  contentType: string;
}

export interface NormalizedJobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobRecord {
  id: string;
  analysisId: string | null;
  url: string;
  normalizedUrl: string | null;
  title: string | null;
  extractor: string | null;
  status: JobStatus;
  options: Record<string, unknown>;
  progress: JobProgress | null;
  result: JobResult | null;
  error: NormalizedJobError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

export interface AnalysisRecord {
  id: string;
  url: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export interface DownloadTokenRecord {
  tokenHash: string;
  jobId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}
