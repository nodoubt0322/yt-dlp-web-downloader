import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";

describe("health route", () => {
  it("returns a public health response without sensitive details", async () => {
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
    expect(response.json()).toHaveProperty("time");
    expect(response.body).not.toContain("ADMIN_TOKEN");
  });
});

