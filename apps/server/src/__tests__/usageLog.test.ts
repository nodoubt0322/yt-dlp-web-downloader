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
        config: {
          minFreeDiskBytes: 1
        },
        accessLog: true,
        services: {
          queue: { enqueue: async () => undefined },
          urlResolver: async () => ["93.184.216.34"],
          getFreeBytes: async () => 10_000,
          now: () => new Date(2026, 5, 30, 22, 14, 52)
        }
      });

      await app.inject({ method: "GET", url: "/health" });
      expect(log).not.toHaveBeenCalled();

      const created = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { url: "https://example.com/watch?v=usage" }
      });
      expect(created.statusCode).toBe(202);

      const jobId = created.json().jobId;
      await app.inject({ method: "GET", url: `/api/jobs/${jobId}` });
      await app.close();

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("[usage] 2026-06-30 22:14 service used");
    } finally {
      log.mockRestore();
    }
  });
});
