import { randomBytes } from "node:crypto";

export type IdPrefix = "job" | "ana" | "dl";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

export function isValidJobId(value: string): boolean {
  return /^job_[A-Za-z0-9_-]+$/.test(value);
}
