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
    expect(globalThis.localStorage?.getItem("yt-dlp-admin-token")).toBeUndefined();
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

  it("shows client-side URL validation and the required safety copy", async () => {
    render(<App />);

    expect(
      screen.getByText("請只下載你擁有權利或已取得授權的內容；本工具不支援 DRM 或付費牆繞過。")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    expect(await screen.findByText("請先輸入影片網址。")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("影片 URL"), "notaurl");
    await userEvent.click(screen.getByRole("button", { name: "分析" }));
    expect(await screen.findByText("請輸入有效的 http 或 https 網址。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/analyze", expect.anything());
  });

  it("shows system dependency problems in Chinese, including ffmpeg copy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...systemOk(),
        ffmpeg: { ok: false, version: null },
        storage: { ok: false, writable: false, freeBytes: 0, minRequiredFreeBytes: 1000 }
      })
    );
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    expect(await screen.findByText(/ffmpeg 無法使用，完成下載可能會失敗。/)).toBeInTheDocument();
    expect(screen.queryByText(/storage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/儲存空間目前不可寫入或容量不足。/)).not.toBeInTheDocument();
  });

  it("labels yt-dlp output as a version and omits storage from the status panel", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(systemOk()));
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    expect(await screen.findByText("yt-dlp 版本")).toBeInTheDocument();
    expect(screen.getByText("2026.01.01")).toBeInTheDocument();
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
    expect(screen.getByText("來源：youtube")).toBeInTheDocument();
    expect(screen.getByText("長度：2:03")).toBeInTheDocument();
    expect(screen.getByText("格式：mp4，最高 1080p，含影像與音訊")).toBeInTheDocument();
    expect(screen.getByAltText("Demo Video 縮圖")).toHaveAttribute("src", "https://example.com/thumb.jpg");
    expect(screen.getByRole("button", { name: "開始下載預設品質" })).toBeInTheDocument();
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
    durationSeconds: 123,
    extractor: "youtube",
    webpageUrl: "https://example.com/watch?v=demo",
    recommendedOptions: { qualityPreset: "bestUnder1080p", preferMp4: true },
    formatSummary: "mp4 up to 1080p"
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
