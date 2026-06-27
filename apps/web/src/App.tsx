import { useEffect, useState } from "react";
import { HomePage } from "./routes/HomePage";
import { JobPage } from "./routes/JobPage";

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    function syncPath() {
      setPath(window.location.pathname);
    }

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  function navigateToJob(jobId: string) {
    setActiveJobId(jobId);
    if (window.location.pathname !== "/") {
      window.history.pushState(null, "", "/");
      setPath(window.location.pathname);
    }
  }

  const jobMatch = /^\/jobs\/([^/]+)$/.exec(path);
  const jobId = jobMatch?.[1];
  if (jobId) {
    return <JobPage jobId={jobId} />;
  }

  return <HomePage activeJobId={activeJobId} onNavigateToJob={navigateToJob} />;
}
