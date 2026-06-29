import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn<typeof fetch>();

// jsdom ships HTMLDialogElement but not its modal methods; provide minimal stand-ins.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(systemOk()));
  vi.stubGlobal("fetch", fetchMock);
  // Phone viewport: the (max-width: 620px) swap is active; reduced-motion short-circuits useHomeMotion.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width: 620px") || query.includes("reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  }));
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("mobile token settings", () => {
  it("manages the token through the masthead gear dialog without duplicating the field", async () => {
    render(<App />);

    const trigger = screen.getByRole("button", { name: "管理 Token，未設定" });
    // The inline sidebar panel must not also render, or the shared #admin-token field would duplicate.
    expect(document.querySelectorAll("#admin-token")).toHaveLength(1);

    const dialog = document.querySelector("dialog.token-dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    await userEvent.click(trigger);
    expect(dialog.open).toBe(true);

    await userEvent.type(within(dialog).getByLabelText("管理 Token"), "admin-token");
    await userEvent.click(within(dialog).getByRole("button", { name: "儲存 Token" }));

    expect(sessionStorage.getItem("yt-dlp-admin-token")).toBe("admin-token");
    expect(dialog.open).toBe(false);
    expect(screen.getByRole("button", { name: "管理 Token，已設定" })).toBeInTheDocument();
  });

  it("shows readiness as a compact masthead pill instead of the full panel when the system is healthy", async () => {
    sessionStorage.setItem("yt-dlp-admin-token", "admin-token");

    render(<App />);

    expect(await screen.findByText("可用")).toBeInTheDocument();
    expect(screen.getByText("狀態")).toBeInTheDocument();
    // The full readiness panel is removed on phones while the system is healthy.
    expect(screen.queryByRole("heading", { name: "系統狀態" })).not.toBeInTheDocument();
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
