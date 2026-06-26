import { spawn } from "node:child_process";

export interface RunProcessOptions {
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
}

export class ProcessRunnerError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;

  constructor(message: string, options: { stdout: string; stderr: string; exitCode: number | null; timedOut?: boolean }) {
    super(message);
    this.name = "ProcessRunnerError";
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.exitCode = options.exitCode;
    this.timedOut = options.timedOut ?? false;
  }
}

export function runProcess(command: string, args: string[], options: RunProcessOptions): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ProcessRunnerError(error.message, { stdout, stderr, exitCode: null }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new ProcessRunnerError("Process timed out", { stdout, stderr, exitCode, timedOut: true }));
        return;
      }

      if (exitCode !== 0) {
        reject(new ProcessRunnerError(`Process exited with code ${exitCode}`, { stdout, stderr, exitCode }));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}
