import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  sessionStorage.setItem("yt-dlp-admin-token", "admin-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("job flow", () => {
  it("creates a selected-quality job from an analysis and keeps compact job status on the home page", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(jsonResponse(analysisResponse()))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job_123", status: "queued", statusUrl: "/api/jobs/job_123" }))
      .mockResolvedValueOnce(jsonResponse(jobResponse({ status: "queued" })));

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    await userEvent.selectOptions(await screen.findByLabelText("下載品質"), "bestUnder720p");
    await userEvent.click(screen.getByRole("button", { name: "開始下載" }));

    await screen.findByText("等待下載開始");

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "分析影片連結" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "下載狀態" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Demo Video" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/jobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
        body: JSON.stringify({
          analysisId: "ana_123",
          url: "https://example.com/watch?v=demo",
          options: { qualityPreset: "bestUnder720p", preferMp4: true }
        })
      })
    );
  });

  it("polls running jobs every 1-3 seconds and stops after completion", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(jobResponse({ status: "running", progress: runningProgress() })))
      .mockResolvedValueOnce(
        jsonResponse(jobResponse({ status: "completed", progress: { percent: 100 }, result: completedResult() }))
      );
    window.history.replaceState(null, "", "/jobs/job_123");

    render(<App />);

    await act(async () => undefined);

    expect(screen.getByText("下載進行中")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("速度：2 MB/s")).toBeInTheDocument();
    expect(screen.getByText("剩餘：約 1 分 5 秒")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("link", { name: "下載檔案" })).toHaveAttribute("href", "/api/download/dl_123");
    expect(screen.getByText(/檔案會在 2026-06-28 08:00 後過期/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling failed jobs and shows sanitized Chinese errors", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        jobResponse({
          status: "failed",
          error: {
            code: "YTDLP_FAILED",
            message: "Traceback /Users/private/file token=secret",
            retryable: false
          }
        })
      )
    );
    window.history.replaceState(null, "", "/jobs/job_123");

    render(<App />);

    await act(async () => undefined);

    expect(screen.getByText("下載失敗，請稍後再試。")).toBeInTheDocument();
    expect(screen.queryByText(/Users/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function systemOk() {
  return {
    ytDlp: { ok: true, version: "2026.01.01" },
    ffmpeg: { ok: true, version: "6.1" },
    ffprobe: { ok: true, version: "6.1" },
    storage: { ok: true, writable: true, freeBytes: 10_000, minRequiredFreeBytes: 1000 }
  };
}

function analysisResponse() {
  return {
    analysisId: "ana_123",
    url: "https://example.com/watch?v=demo",
    title: "Demo Video",
    thumbnail: "https://example.com/thumb.jpg",
    durationSeconds: 123,
    extractor: "youtube",
    webpageUrl: "https://example.com/watch?v=demo"
  };
}

function runningProgress() {
  return {
    phase: "downloading",
    percent: 42,
    downloadedBytes: 42_000_000,
    totalBytes: 100_000_000,
    speedBytesPerSecond: 2_000_000,
    etaSeconds: 65
  };
}

function completedResult() {
  return {
    fileName: "demo.mp4",
    size: 12,
    contentType: "video/mp4",
    downloadUrl: "/api/download/dl_123",
    expiresAt: "2026-06-28T00:00:00.000Z"
  };
}

function jobResponse(overrides: Record<string, unknown>) {
  return {
    id: "job_123",
    analysisId: "ana_123",
    url: "https://example.com/watch?v=demo",
    title: "Demo Video",
    extractor: "youtube",
    status: "queued",
    progress: null,
    result: null,
    error: null,
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    expiresAt: "2026-06-28T00:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
