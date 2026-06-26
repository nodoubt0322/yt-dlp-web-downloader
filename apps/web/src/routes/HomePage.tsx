import { useEffect, useMemo, useState } from "react";
import { createApiClient, type AnalysisResult, type SystemCheck } from "../apiClient";
import { readAdminToken, saveAdminToken } from "../auth";
import { ErrorAlert } from "../components/ErrorAlert";
import { SystemStatusBanner } from "../components/SystemStatusBanner";
import { TokenGate } from "../components/TokenGate";
import { UrlSubmitForm } from "../components/UrlSubmitForm";
import { VideoMetadataCard } from "../components/VideoMetadataCard";
import { messageForError } from "./messages";

interface HomePageProps {
  onNavigateToJob: (jobId: string) => void;
}

export function HomePage({ onNavigateToJob }: HomePageProps) {
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
          <p className="eyebrow">Local Video Link Downloader</p>
          <h1>yt-dlp 影片下載器</h1>
        </header>

        <TokenGate token={token} onSave={handleSaveToken} />
        <SystemStatusBanner status={systemStatus} loading={systemLoading} hasToken={Boolean(token)} />
        <UrlSubmitForm disabled={false} loading={analysisLoading} error={analysisError} onSubmit={handleAnalyze} />
        {analysis ? (
          <VideoMetadataCard analysis={analysis} creatingJob={creatingJob} onStartDownload={handleStartDownload} />
        ) : null}
        <ErrorAlert message={jobError} />
      </section>
    </main>
  );
}
