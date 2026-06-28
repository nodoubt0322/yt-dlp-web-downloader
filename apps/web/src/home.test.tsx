import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("home downloader flow", () => {
  it("stores the admin token in sessionStorage and sends it as a bearer token", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(jsonResponse(analysisResponse()));

    render(<App />);

    await userEvent.type(screen.getByLabelText("管理 Token"), "admin-token");
    await userEvent.click(screen.getByRole("button", { name: "儲存 Token" }));
    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    await screen.findByRole("heading", { name: "Demo Video" });

    expect(sessionStorage.getItem("yt-dlp-admin-token")).toBe("admin-token");
    expect(globalThis.localStorage?.getItem("yt-dlp-admin-token") ?? null).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/check",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/analyze",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
        body: JSON.stringify({ url: "https://example.com/watch?v=demo" })
      })
    );
  });

  it("uses the configured Cloudflare API base URL when deployed away from the local backend", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://dlp-api.example.com");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(jsonResponse(analysisResponse()));
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    await screen.findByRole("heading", { name: "Demo Video" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dlp-api.example.com/api/system/check",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dlp-api.example.com/api/analyze",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows client-side URL validation and the required safety copy", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    expect(await screen.findByText("請先輸入影片網址。")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("影片 URL"), "notaurl");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    expect(await screen.findByText("請輸入有效的 http 或 https 網址。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/analyze", expect.anything());
  });

  it("shows system problems without exposing implementation dependency names", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...systemOk(),
        ffmpeg: { ok: false, version: null },
        storage: { ok: false, writable: false, freeBytes: 0, minRequiredFreeBytes: 1000 }
      })
    );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    expect(await screen.findByText(/影片下載服務目前不可用。/)).toBeInTheDocument();
    expect(screen.queryByText(/ffmpeg/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/storage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/儲存空間目前不可寫入或容量不足。/)).not.toBeInTheDocument();
  });

  it("shows a simple system status and hides dependency details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(systemOk()));
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "系統狀態" })).toBeInTheDocument();
    expect(screen.getByText("可用")).toBeInTheDocument();
    expect(screen.queryByText("系統正常，可以開始分析網址。")).not.toBeInTheDocument();
    expect(screen.queryByText("yt-dlp 版本號")).not.toBeInTheDocument();
    expect(screen.queryByText("v2026.01.01")).not.toBeInTheDocument();
    expect(screen.queryByText(/ffmpeg/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ffprobe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/storage/i)).not.toBeInTheDocument();
  });

  it("renders analysis metadata and the default download action", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysisResponse(),
          formatSummary: {
            hasVideo: true,
            hasAudio: true,
            maxHeight: 1080,
            ext: "mp4"
          }
        })
      );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    expect(await screen.findByRole("heading", { name: "Demo Video" })).toBeInTheDocument();
    expect(screen.getByText("長度：0分8秒")).toBeInTheDocument();
    expect(screen.queryByText("來源：youtube")).not.toBeInTheDocument();
    expect(screen.queryByText("格式：mp4，1080p，含影像與音訊")).not.toBeInTheDocument();
    expect(screen.getByAltText("Demo Video 縮圖")).toHaveAttribute("src", "https://example.com/thumb.jpg");
    expect(screen.getByLabelText("下載品質")).toHaveValue("bestAvailable");
    expect(screen.getByRole("option", { name: "原始畫質" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1080p" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "720p" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "480p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始下載" })).toBeInTheDocument();
    expect(screen.queryByText("優先 mp4，依選擇的最高畫質建立任務。")).not.toBeInTheDocument();
  });

  it("explains when the selected quality will fall back to the highest available resolution", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysisResponse(),
          formatSummary: {
            hasVideo: true,
            hasAudio: true,
            maxHeight: 720,
            ext: "mp4"
          }
        })
      );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    await userEvent.selectOptions(await screen.findByLabelText("下載品質"), "bestUnder1080p");

    expect(await screen.findByText("這支影片沒有 1080p，會改用可取得的 720p。")).toBeInTheDocument();
  });

  it("keeps quality labels simple when yt-dlp metadata includes format sizes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(
        jsonResponse({
          ...analysisResponse(),
          formatSummary: {
            hasVideo: true,
            hasAudio: true,
            maxHeight: 1080,
            ext: "mp4",
            qualityEstimates: [
              { preset: "bestAvailable", height: 1080, sizeBytes: 19_000_000, approximate: false },
              { preset: "bestUnder1080p", height: 1080, sizeBytes: 19_000_000, approximate: false },
              { preset: "bestUnder720p", height: 720, sizeBytes: 11_000_000, approximate: true },
              { preset: "bestUnder480p", height: 480, sizeBytes: 7_000_000, approximate: false }
            ]
          }
        })
      );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    expect(await screen.findByRole("option", { name: "原始畫質" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "720p" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /MB/ })).not.toBeInTheDocument();
  });

  it("shows sanitized Chinese API errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(systemOk()))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "YTDLP_FAILED",
              message: "Error: /Users/local/private/path token=secret",
              retryable: false
            }
          },
          500
        )
      );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    await userEvent.type(screen.getByLabelText("影片 URL"), "https://example.com/watch?v=demo");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));

    await waitFor(() => expect(screen.getByText("分析失敗，請稍後再試。")).toBeInTheDocument());
    expect(screen.queryByText(/Users/)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
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
    durationSeconds: 7.569,
    extractor: "youtube",
    webpageUrl: "https://example.com/watch?v=demo",
    recommendedOptions: { qualityPreset: "bestAvailable" },
    formatSummary: "mp4 up to 1080p"
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
