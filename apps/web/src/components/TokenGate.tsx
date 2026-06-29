import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";

interface TokenGateProps {
  token: string;
  onSave: (token: string) => void;
}

// Shared token form body, reused by the desktop sidebar panel and the mobile dialog.
function TokenFields({ token, draft, onChange }: { token: string; draft: string; onChange: (value: string) => void }) {
  return (
    <>
      <div className="panel-heading compact-heading">
        <div>
          <h2 id="token-dialog-title">管理 Token</h2>
          <p>只儲存在當前session。</p>
        </div>
        <span className={token ? "status-pill success" : "status-pill neutral"}>{token ? "已設定" : "未設定"}</span>
      </div>
      <label htmlFor="admin-token">管理 Token</label>
      <div className="input-row compact">
        <input
          id="admin-token"
          name="token"
          type="password"
          value={draft}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="submit">儲存 Token</button>
      </div>
    </>
  );
}

// Desktop: inline sidebar panel.
export function TokenGate({ token, onSave }: TokenGateProps) {
  const [draft, setDraft] = useState(token);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form className="panel token-panel" onSubmit={handleSubmit}>
      <TokenFields token={token} draft={draft} onChange={setDraft} />
    </form>
  );
}

// Mobile: a gear button that opens token management in a centered dialog,
// keeping it out of the primary analyze → download flow.
export function TokenDialog({ token, onSave }: TokenGateProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(token);

  // Re-seed the field from the saved token each time the dialog is opened.
  useEffect(() => {
    setDraft(token);
  }, [token]);

  function openDialog() {
    setDraft(token);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
    closeDialog();
  }

  // Close when the backdrop (the dialog element itself, outside the form) is clicked.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      closeDialog();
    }
  }

  return (
    <div className="token-settings">
      <button
        type="button"
        className="token-trigger"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={token ? "管理 Token，已設定" : "管理 Token，未設定"}
      >
        <GearIcon />
        <span className={token ? "token-dot set" : "token-dot unset"} aria-hidden="true" />
      </button>
      <dialog ref={dialogRef} className="token-dialog" aria-labelledby="token-dialog-title" onClick={handleBackdropClick}>
        <form className="token-panel" onSubmit={handleSubmit}>
          <TokenFields token={token} draft={draft} onChange={setDraft} />
          <button type="button" className="dialog-dismiss" onClick={closeDialog}>
            關閉
          </button>
        </form>
      </dialog>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
