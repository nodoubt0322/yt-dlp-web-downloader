import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { createApiClient, type JobDetails } from "../apiClient";
import { readAdminToken } from "../auth";
import { DownloadResultCard } from "../components/DownloadResultCard";
import { ErrorAlert } from "../components/ErrorAlert";
import { JobProgressCard } from "../components/JobProgressCard";
import { messageForError } from "./messages";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "expired"]);

interface JobPageProps {
  jobId: string;
}

export function JobPage({ jobId }: JobPageProps) {
  const [token] = useState(readAdminToken);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => createApiClient(() => token), [token]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const nextJob = await api.getJob(jobId);
        if (!active) {
          return;
        }
        setJob(nextJob);
        setError(nextJob.error ? messageForError(nextJob.error, "job") : null);
        if (!TERMINAL_STATUSES.has(nextJob.status)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (pollError) {
        if (active) {
          setError(messageForError(pollError, "job"));
        }
      }
    }

    void poll();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [api, jobId]);

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="page-bar">
          <a className="back-link" href="/" onClick={handleBackClick}>
            返回分析
          </a>
          <span className="job-id">{jobId}</span>
        </header>
        <div className="primary-stack">
          {job ? <JobProgressCard job={job} /> : <div className="panel skeleton-panel">正在讀取下載任務...</div>}
          {job?.status === "completed" && job.result ? <DownloadResultCard result={job.result} /> : null}
          <ErrorAlert message={error} />
        </div>
      </section>
    </main>
  );
}

function handleBackClick(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  window.history.pushState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}
