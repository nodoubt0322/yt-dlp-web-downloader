import { FormEvent, useState } from "react";

interface TokenGateProps {
  token: string;
  onSave: (token: string) => void;
}

export function TokenGate({ token, onSave }: TokenGateProps) {
  const [draft, setDraft] = useState(token);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form className="panel token-panel" onSubmit={handleSubmit}>
      <label htmlFor="admin-token">管理 Token</label>
      <div className="input-row compact">
        <input
          id="admin-token"
          name="token"
          type="password"
          value={draft}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">儲存 Token</button>
      </div>
    </form>
  );
}

