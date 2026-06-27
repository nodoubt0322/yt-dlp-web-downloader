export interface PublicError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface DependencyStatus {
  ok: boolean;
  version: string | null;
}

export interface SystemCheck {
  ytDlp: DependencyStatus;
  ffmpeg: DependencyStatus;
  ffprobe: DependencyStatus;
  storage: {
    ok: boolean;
    writable: boolean;
    freeBytes: number;
    minRequiredFreeBytes: number;
  };
}

export interface AnalysisResult {
  analysisId: string;
  url: string;
  title: string;
  thumbnail?: string;
  durationSeconds?: number;
  extractor?: string;
  webpageUrl?: string;
  recommendedOptions?: Record<string, unknown>;
  formatSummary?: {
    hasVideo?: boolean;
    hasAudio?: boolean;
    maxHeight?: number | null;
    ext?: string | null;
  };
}

export type QualityPreset = "bestAvailable" | "bestUnder1080p" | "bestUnder720p" | "bestUnder480p";

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
  downloadUrl?: string;
  expiresAt?: string;
}

export interface JobDetails {
  jobId: string;
  id: string;
  analysisId: string | null;
  url: string;
  title?: string | null;
  extractor?: string | null;
  status: JobStatus;
  progress: JobProgress | null;
  result: JobResult | null;
  error: PublicError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

export interface CreatedJob {
  jobId: string;
  status: "queued";
  statusUrl: string;
}

export class ApiError extends Error {
  code: string;
  retryable: boolean;

  constructor(error: PublicError) {
    super(error.message);
    this.name = "ApiError";
    this.code = error.code;
    this.retryable = error.retryable;
  }
}

export function createApiClient(getToken: () => string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (init.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, { ...init, headers });
    const data = await readJson(response);

    if (!response.ok) {
      throw new ApiError(readPublicError(data));
    }

    return data as T;
  }

  return {
    checkSystem: () => request<SystemCheck>("/api/system/check"),
    analyze: (url: string) =>
      request<AnalysisResult>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ url })
      }),
    createJob: (analysis: Pick<AnalysisResult, "analysisId" | "url">, options: { qualityPreset: QualityPreset }) =>
      request<CreatedJob>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          analysisId: analysis.analysisId,
          url: analysis.url,
          options: { qualityPreset: options.qualityPreset, preferMp4: true }
        })
      }),
    getJob: (jobId: string) => request<JobDetails>(`/api/jobs/${jobId}`)
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readPublicError(data: unknown): PublicError {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: Partial<PublicError> }).error;
    if (error && typeof error.code === "string") {
      return {
        code: error.code,
        message: typeof error.message === "string" ? error.message : "Request failed",
        retryable: Boolean(error.retryable)
      };
    }
  }

  return {
    code: "REQUEST_FAILED",
    message: "Request failed",
    retryable: true
  };
}
