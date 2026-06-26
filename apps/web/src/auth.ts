const TOKEN_KEY = "yt-dlp-admin-token";

export function readAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function saveAdminToken(token: string) {
  const trimmed = token.trim();
  sessionStorage.setItem(TOKEN_KEY, trimmed);
  return trimmed;
}

