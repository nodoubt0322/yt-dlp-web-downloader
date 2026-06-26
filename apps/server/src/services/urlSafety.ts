import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type DnsResolver = (hostname: string) => Promise<string[]>;

export class UnsafeUrlError extends Error {
  readonly code = "UNSAFE_URL";

  constructor(message = "Unsafe URL") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export async function assertSafeHttpUrl(input: string, resolver: DnsResolver = defaultResolver): Promise<string> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTP and HTTPS URLs are allowed");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isLocalhostName(hostname) || isUnsafeIpAddress(hostname)) {
    throw new UnsafeUrlError();
  }

  if (!isIP(hostname)) {
    const resolvedAddresses = await resolveHostname(hostname, resolver);
    if (resolvedAddresses.length === 0 || resolvedAddresses.some((address) => isUnsafeIpAddress(normalizeHostname(address)))) {
      throw new UnsafeUrlError();
    }
  }

  return url.toString();
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function resolveHostname(hostname: string, resolver: DnsResolver) {
  try {
    return await resolver(hostname);
  } catch {
    throw new UnsafeUrlError("URL hostname could not be resolved");
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLocalhostName(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isUnsafeIpAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    return isUnsafeIpv4(address);
  }

  if (version === 6) {
    return isUnsafeIpv6(address);
  }

  return false;
}

function isUnsafeIpv4(address: string) {
  const octets = address.split(".").map((part) => Number(part));
  const first = octets[0] ?? 0;
  const second = octets[1] ?? 0;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168 ||
    first >= 224
  );
}

function isUnsafeIpv6(address: string) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) {
    return isUnsafeIpv4(mappedIpv4);
  }

  const firstGroup = normalized.split(":")[0] ?? "";
  const firstWord = Number.parseInt(firstGroup || "0", 16);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    firstWord >= 0xfc00 && firstWord <= 0xfdff ||
    firstWord >= 0xff00 && firstWord <= 0xffff
  );
}

function ipv4FromMappedIpv6(address: string) {
  if (!address.startsWith("::ffff:")) {
    return null;
  }

  const mappedPart = address.slice("::ffff:".length);
  if (isIP(mappedPart) === 4) {
    return mappedPart;
  }

  const words = mappedPart.split(":");
  if (words.length !== 2) {
    return null;
  }

  const high = Number.parseInt(words[0] ?? "", 16);
  const low = Number.parseInt(words[1] ?? "", 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return null;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}
