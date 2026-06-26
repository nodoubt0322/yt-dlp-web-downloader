import type { JobStore } from "./jobStore.js";
import type { createStorageService } from "./storageService.js";

interface CreateCleanupServiceOptions {
  store: JobStore;
  storage: ReturnType<typeof createStorageService>;
  now?: () => Date;
}

export function createCleanupService(options: CreateCleanupServiceOptions) {
  const now = options.now ?? (() => new Date());

  return {
    async runCleanupOnce() {
      const jobs = options.store.listExpiredTerminalJobs(now());
      let deletedDirectories = 0;

      for (const job of jobs) {
        options.store.expireJob(job.id);
        await options.storage.deleteJobDirectory(job.id);
        deletedDirectories += 1;
      }

      return {
        expiredJobs: jobs.length,
        deletedDirectories
      };
    },

    start(intervalMs: number) {
      const timer = setInterval(() => {
        void this.runCleanupOnce();
      }, intervalMs);
      return () => clearInterval(timer);
    }
  };
}
