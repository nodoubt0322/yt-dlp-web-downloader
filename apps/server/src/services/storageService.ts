import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { lookup } from "mime-types";
import { isValidJobId } from "./id.js";

interface CreateStorageServiceOptions {
  dataDir: string;
}

export interface StoredResultFile {
  path: string;
  filename: string;
  size: number;
  contentType: string;
}

export function createStorageService(options: CreateStorageServiceOptions) {
  const jobsDir = resolve(options.dataDir, "jobs");

  async function resolveJobDirectory(jobId: string) {
    if (!isValidJobId(jobId)) {
      throw new Error("Invalid job ID");
    }

    const jobDir = resolve(jobsDir, jobId);
    if (!isPathInside(jobDir, jobsDir)) {
      throw new Error("Job directory must stay inside DATA_DIR/jobs");
    }
    return jobDir;
  }

  return {
    async createJobDirectory(jobId: string): Promise<string> {
      const jobDir = await resolveJobDirectory(jobId);
      await mkdir(jobDir, { recursive: true });
      return jobDir;
    },

    async getJobDirectory(jobId: string): Promise<string> {
      return resolveJobDirectory(jobId);
    },

    async findResultFile(jobId: string): Promise<StoredResultFile | null> {
      const jobDir = await resolveJobDirectory(jobId);
      const entries = await readdir(jobDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || isTempFile(entry.name)) {
          continue;
        }

        const path = resolve(jobDir, entry.name);
        if (!isPathInside(path, jobDir)) {
          continue;
        }

        const fileStat = await stat(path);
        const filename = basename(entry.name);
        return {
          path,
          filename,
          size: fileStat.size,
          contentType: lookup(filename) || "application/octet-stream"
        };
      }

      return null;
    },

    async deleteJobDirectory(jobId: string): Promise<void> {
      const jobDir = await resolveJobDirectory(jobId);
      await rm(jobDir, { force: true, recursive: true });
    }
  };
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const normalizedParent = parentPath.endsWith(sep) ? parentPath : `${parentPath}${sep}`;
  return childPath.startsWith(normalizedParent);
}

function isTempFile(filename: string): boolean {
  return filename.endsWith(".part") || filename.endsWith(".tmp") || filename.endsWith(".ytdl");
}
