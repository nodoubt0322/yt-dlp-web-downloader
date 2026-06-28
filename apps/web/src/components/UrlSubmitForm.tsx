import { FormEvent, useState } from "react";
import { ErrorAlert } from "./ErrorAlert";

interface UrlSubmitFormProps {
  disabled: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (url: string) => void;
}

export function UrlSubmitForm({ disabled, loading, error, onSubmit }: UrlSubmitFormProps) {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validateUrl(url);
    setValidationError(nextError);
    if (nextError) {
      return;
    }
    onSubmit(url.trim());
  }

  return (
    <form className="panel url-form" onSubmit={handleSubmit} noValidate>
      <div className="panel-heading">
        <div>
          <h2>分析影片連結</h2>
        </div>
      </div>
      <div className="input-row">
        <input
          id="video-url"
          aria-label="影片 URL"
          name="url"
          type="url"
          value={url}
          placeholder="https://example.com/watch?v=..."
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" disabled={disabled || loading}>
          {loading ? "分析中" : "分析"}
        </button>
      </div>
      <ErrorAlert message={validationError ?? error} />
    </form>
  );
}

function validateUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "請先輸入影片網址。";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "請輸入有效的 http 或 https 網址。";
    }
  } catch {
    return "請輸入有效的 http 或 https 網址。";
  }

  return null;
}
