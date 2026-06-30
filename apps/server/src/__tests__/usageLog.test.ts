import { describe, expect, it, vi } from "vitest";
import { buildServer, formatUsageLogLine } from "../server.js";

describe("usage log", () => {
  it("formats usage time with date and minute", () => {
    expect(formatUsageLogLine(new Date(2026, 5, 30, 22, 14, 52))).toBe("[usage] 2026-06-30 22:14 service used");
  });

  it("logs when a request uses the service", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const app = await buildServer({
        accessLog: true,
        services: {
          now: () => new Date(2026, 5, 30, 22, 14, 52)
        }
      });

      await app.inject({ method: "GET", url: "/health" });
      await app.close();

      expect(log).toHaveBeenCalledWith("[usage] 2026-06-30 22:14 service used");
    } finally {
      log.mockRestore();
    }
  });
});
