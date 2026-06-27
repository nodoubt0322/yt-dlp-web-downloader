import { useEffect, useMemo, useState } from "react";
import { createApiClient, type AnalysisResult, type SystemCheck } from "../apiClient";
import { readAdminToken, saveAdminToken } from "../auth";
import { ErrorAlert } from "../components/ErrorAlert";
import { SystemStatusBanner } from "../components/SystemStatusBanner";
import { TokenGate } from "../components/TokenGate";
import { UrlSubmitForm } from "../components/UrlSubmitForm";
import { VideoMetadataCard } from "../components/VideoMetadataCard";
import { JobPage } from "./JobPage";
import { messageForError } from "./messages";

interface HomePageProps {
  activeJobId: string | null;
  onNavigateToJob: (jobId: string) => void;
}

export function HomePage({ activeJobId, onNavigateToJob }: HomePageProps) {
  const [token, setToken] = useState(readAdminToken);
  const [systemStatus, setSystemStatus] = useState<SystemCheck | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const api = useMemo(() => createApiClient(() => token), [token]);

  useEffect(() => {
    if (!token) {
      setSystemStatus(null);
      return;
    }

    let active = true;
    setSystemLoading(true);
    api
      .checkSystem()
      .then((status) => {
        if (active) {
          setSystemStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setSystemStatus(null);
        }
      })
      .finally(() => {
        if (active) {
          setSystemLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  function handleSaveToken(nextToken: string) {
    setToken(saveAdminToken(nextToken));
  }

  async function handleAnalyze(url: string) {
    setAnalysisLoading(true);
    setAnalysisError(null);
    setJobError(null);
    try {
      setAnalysis(await api.analyze(url));
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(messageForError(error, "analyze"));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleStartDownload() {
    if (!analysis) {
      return;
    }

    setCreatingJob(true);
    setJobError(null);
    try {
      const job = await api.createJob(analysis);
      onNavigateToJob(job.jobId);
    } catch (error) {
      setJobError(messageForError(error, "job"));
    } finally {
      setCreatingJob(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="masthead">
          <div>
            <p className="eyebrow">Local Video Link Downloader</p>
            <h1>
              <span>yt-dlp</span> <span>影片下載器</span>
            </h1>
            <p className="lede">分析授權影片連結、建立本機下載任務，並用有期限的 signed URL 取回完成檔案。</p>
          </div>
          <div className="workflow-stage" aria-hidden="true">
            <div className="masthead-status">
              <span>單一擁有者</span>
              <strong>本機後端</strong>
            </div>
            <div className="flow-map">
              <span className="flow-line flow-line-primary" />
              <span className="flow-line flow-line-secondary" />
              <span className="flow-node node-source">URL</span>
              <span className="flow-node node-analyze">metadata</span>
              <span className="flow-node node-job">job</span>
              <span className="flow-node node-file">signed URL</span>
            </div>
          </div>
        </header>

        <div className="workflow-grid">
          <aside className="sidebar-stack" aria-label="系統狀態">
            <TokenGate token={token} onSave={handleSaveToken} />
            <SystemStatusBanner status={systemStatus} loading={systemLoading} hasToken={Boolean(token)} />
          </aside>

          <div className="primary-stack">
            <UrlSubmitForm disabled={false} loading={analysisLoading} error={analysisError} onSubmit={handleAnalyze} />
            {analysis ? (
              <VideoMetadataCard analysis={analysis} creatingJob={creatingJob} onStartDownload={handleStartDownload} />
            ) : activeJobId ? (
              <JobPage jobId={activeJobId} embedded />
            ) : (
              <section className="panel empty-panel" aria-label="尚未分析影片">
                <h2>貼上 URL 後先分析，再建立下載任務</h2>
                <p>分析只讀取 metadata，不會直接下載影片。完成後你可以用預設品質建立非同步 job。</p>
              </section>
            )}
            {analysis && activeJobId ? <JobPage jobId={activeJobId} embedded /> : null}
            <ErrorAlert message={jobError} />
          </div>
        </div>
      </section>
    </main>
  );
}
