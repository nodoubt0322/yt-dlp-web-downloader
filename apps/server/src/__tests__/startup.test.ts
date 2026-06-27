import { describe, expect, it } from "vitest";
import { formatListenUrl } from "../startup.js";

describe("formatListenUrl", () => {
  it("formats the configured listen port for terminal output", () => {
    expect(formatListenUrl("127.0.0.1", 8787)).toBe("http://127.0.0.1:8787");
  });

  it("prints a browser-friendly localhost URL for wildcard hosts", () => {
    expect(formatListenUrl("0.0.0.0", 5173)).toBe("http://localhost:5173");
    expect(formatListenUrl("::", 5173)).toBe("http://localhost:5173");
  });
});
