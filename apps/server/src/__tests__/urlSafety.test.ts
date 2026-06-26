import { describe, expect, it } from "vitest";
import { assertSafeHttpUrl, type DnsResolver } from "../services/urlSafety.js";

const publicResolver: DnsResolver = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];

describe("assertSafeHttpUrl", () => {
  it("returns a normalized http or https URL", async () => {
    await expect(assertSafeHttpUrl("http://example.com/watch?v=1", publicResolver)).resolves.toBe(
      "http://example.com/watch?v=1"
    );
    await expect(assertSafeHttpUrl("https://example.com/video", publicResolver)).resolves.toBe(
      "https://example.com/video"
    );
  });

  it.each(["file:///etc/passwd", "ftp://example.com/video", "data:text/plain,hello", "javascript:alert(1)"])(
    "rejects unsupported protocol %s",
    async (input) => {
      await expect(assertSafeHttpUrl(input, publicResolver)).rejects.toMatchObject({
        code: "UNSAFE_URL"
      });
    }
  );

  it.each([
    "http://localhost/video",
    "http://127.0.0.1/video",
    "http://10.0.0.1/video",
    "http://172.16.0.1/video",
    "http://192.168.1.1/video",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/video",
    "http://[fc00::1]/video",
    "http://[fe80::1]/video"
  ])("rejects local or private URL %s", async (input) => {
    await expect(assertSafeHttpUrl(input, publicResolver)).rejects.toMatchObject({
      code: "UNSAFE_URL"
    });
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    const resolver: DnsResolver = async (hostname) => {
      expect(hostname).toBe("video.example");
      return ["10.0.0.5"];
    };

    await expect(assertSafeHttpUrl("https://video.example/watch", resolver)).rejects.toMatchObject({
      code: "UNSAFE_URL"
    });
  });

  it("rejects hostnames that cannot be resolved", async () => {
    const resolver: DnsResolver = async () => {
      throw new Error("ENOTFOUND");
    };

    await expect(assertSafeHttpUrl("https://missing.example/watch", resolver)).rejects.toMatchObject({
      code: "UNSAFE_URL"
    });
  });

  it("rejects IPv4-mapped IPv6 private addresses", async () => {
    await expect(assertSafeHttpUrl("http://[::ffff:127.0.0.1]/video", publicResolver)).rejects.toMatchObject({
      code: "UNSAFE_URL"
    });
  });
});
