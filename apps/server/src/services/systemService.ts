import { execFile } from "node:child_process";
import { mkdir, statfs, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AppConfig } from "../config.js";

const execFileAsync = promisify(execFile);

export interface DependencyStatus {
  ok: boolean;
  version: string | null;
}

export interface StorageStatus {
  ok: boolean;
  writable: boolean;
  freeBytes: number;
  minRequiredFreeBytes: number;
}

export interface SystemCheckResult {
  ytDlp: DependencyStatus;
  ffmpeg: DependencyStatus;
  ffprobe: DependencyStatus;
  storage: StorageStatus;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface SystemService {
  check(): Promise<SystemCheckResult>;
}

interface CreateSystemServiceOptions {
  config: Pick<AppConfig, "dataDir" | "ytDlpBinary" | "ffmpegBinary" | "ffprobeBinary" | "minFreeDiskBytes">;
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>;
  getFreeBytes?: (dataDir: string) => Promise<number>;
}

export function createSystemService(options: CreateSystemServiceOptions): SystemService {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const getFreeBytes = options.getFreeBytes ?? defaultGetFreeBytes;

  return {
    async check() {
      const [ytDlp, ffmpeg, ffprobe, storage] = await Promise.all([
        checkDependency(runCommand, options.config.ytDlpBinary, ["--version"], parseYtDlpVersion),
        checkDependency(runCommand, options.config.ffmpegBinary, ["-version"], parseFfmpegVersion),
        checkDependency(runCommand, options.config.ffprobeBinary, ["-version"], parseFfmpegVersion),
        checkStorage(options.config.dataDir, options.config.minFreeDiskBytes, getFreeBytes)
      ]);

      return {
        ytDlp,
        ffmpeg,
        ffprobe,
        storage
      };
    }
  };
}

async function checkDependency(
  runCommand: (command: string, args: string[]) => Promise<CommandResult>,
  command: string,
  args: string[],
  parseVersion: (output: string) => string | null
): Promise<DependencyStatus> {
  try {
    const result = await runCommand(command, args);
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);

    return {
      ok: Boolean(version),
      version
    };
  } catch {
    return {
      ok: false,
      version: null
    };
  }
}

async function checkStorage(
  dataDir: string,
  minRequiredFreeBytes: number,
  getFreeBytes: (dataDir: string) => Promise<number>
): Promise<StorageStatus> {
  let writable = false;
  let freeBytes = 0;

  try {
    await mkdir(dataDir, { recursive: true });
    const probePath = join(dataDir, `.write-check-${process.pid}-${Date.now()}`);
    await writeFile(probePath, "ok");
    await unlink(probePath);
    writable = true;
    freeBytes = await getFreeBytes(dataDir);
  } catch {
    writable = false;
  }

  return {
    ok: writable && freeBytes >= minRequiredFreeBytes,
    writable,
    freeBytes,
    minRequiredFreeBytes
  };
}

async function defaultRunCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    timeout: 5_000,
    windowsHide: true
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function defaultGetFreeBytes(dataDir: string) {
  const stats = await statfs(dataDir);
  return stats.bavail * stats.bsize;
}

function parseYtDlpVersion(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function parseFfmpegVersion(output: string) {
  const match = output.match(/\bversion\s+([^\s]+)/i);
  return match?.[1] ?? null;
}
