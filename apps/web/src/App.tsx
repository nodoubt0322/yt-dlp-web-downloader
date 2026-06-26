import { useEffect, useState } from "react";
import { HomePage } from "./routes/HomePage";
import { JobPage } from "./routes/JobPage";

export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    function syncPath() {
      setPath(window.location.pathname);
    }

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  function navigateToJob(jobId: string) {
    window.history.pushState(null, "", `/jobs/${jobId}`);
    setPath(window.location.pathname);
  }

  const jobMatch = /^\/jobs\/([^/]+)$/.exec(path);
  const jobId = jobMatch?.[1];
  if (jobId) {
    return <JobPage jobId={jobId} />;
  }

  return <HomePage onNavigateToJob={navigateToJob} />;
}
