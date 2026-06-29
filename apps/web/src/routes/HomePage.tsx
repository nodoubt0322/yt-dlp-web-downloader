import { useEffect, useMemo, useRef, useState } from "react";
import { createApiClient, type AnalysisResult, type QualityPreset, type SystemCheck } from "../apiClient";
import { readAdminToken, saveAdminToken } from "../auth";
import { ErrorAlert } from "../components/ErrorAlert";
import { SystemStatusBanner } from "../components/SystemStatusBanner";
import { TokenDialog, TokenGate } from "../components/TokenGate";
import { UrlSubmitForm } from "../components/UrlSubmitForm";
import { VideoMetadataCard } from "../components/VideoMetadataCard";
import { useHomeMotion } from "../useHomeMotion";
import { useMediaQuery } from "../useMediaQuery";
import { JobPage } from "./JobPage";
import { messageForError } from "./messages";

interface HomePageProps {
  activeJobId: string | null;
  onClearActiveJob: () => void;
  onNavigateToJob: (jobId: string) => void;
}

export function HomePage({ activeJobId, onClearActiveJob, onNavigateToJob }: HomePageProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [token, setToken] = useState(readAdminToken);
  const [systemStatus, setSystemStatus] = useState<SystemCheck | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const api = useMemo(() => createApiClient(() => token), [token]);
  // On phones, token management collapses into a masthead gear + dialog so the
  // analyze → download flow stays at the top with no large scrolling.
  const isMobile = useMediaQuery("(max-width: 620px)");
  useHomeMotion(rootRef);

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
    // Surface the missing token up front; otherwise a 401 reads like a server fault.
    if (!token) {
      setAnalysis(null);
      setJobError(null);
      setAnalysisError("請先設定管理 Token，才能分析影片。");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    setJobError(null);
    onClearActiveJob();
    try {
      setAnalysis(await api.analyze(url));
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(messageForError(error, "analyze"));
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function handleStartDownload(qualityPreset: QualityPreset) {
    if (!analysis) {
      return;
    }

    setCreatingJob(true);
    setJobError(null);
    try {
      const job = await api.createJob(analysis, { qualityPreset });
      onNavigateToJob(job.jobId);
    } catch (error) {
      setJobError(messageForError(error, "job"));
    } finally {
      setCreatingJob(false);
    }
  }

  return (
    <main className="app-shell" ref={rootRef}>
      <section className="workspace">
        <header className="masthead">
          <div className="masthead-copy">
            <p className="eyebrow">Video Link Downloader</p>
            <h1>
              <span>影片下載器</span>
            </h1>
          </div>
          {isMobile ? <TokenDialog token={token} onSave={handleSaveToken} /> : null}
          <div className="workflow-stage" aria-hidden="true">
            <div className="masthead-status">
              <span>私人工具</span>
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
            {!isMobile ? <TokenGate token={token} onSave={handleSaveToken} /> : null}
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
