# yt-dlp Web Downloader

Local single-owner web app for analyzing a video URL with `yt-dlp`, running an asynchronous download job, and serving the completed file through an expiring signed link.

## What It Does

1. Enter one video URL in the web UI.
2. The backend validates the URL, blocks private-network targets, and analyzes metadata with `yt-dlp --dump-json`.
3. Start a default-quality download job.
4. The backend runs the job asynchronously with concurrency `1`, writes files under `DATA_DIR/jobs/{jobId}`, and tracks progress.
5. When complete, the app shows a signed download URL that expires after the configured TTL.

This is built for a single owner running the backend locally, optionally exposed through Cloudflare Tunnel. It is not an anonymous public downloader.

## Requirements

- Node.js 22+ with `node:sqlite` support. Development was verified on Node `v26.4.0`.
- pnpm 11+
- `yt-dlp`
- `ffmpeg`
- `ffprobe`

Install media tools on macOS:

```bash
brew install yt-dlp ffmpeg
```

Update `yt-dlp` when a site changes:

```bash
brew upgrade yt-dlp
```

## Setup

```bash
pnpm install
cp .env.example .env
```

Set `ADMIN_TOKEN` in `.env` to a long random value. API routes require:

```text
Authorization: Bearer <ADMIN_TOKEN>
```

The browser UI stores this token in `sessionStorage`, not `localStorage`.

## Quick Start

For local development:

```bash
pnpm install
ADMIN_TOKEN=dev-token pnpm dev
```

Open:

```text
http://127.0.0.1:8787
```

Enter `dev-token` in the UI token field before using protected API actions.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

The backend listens on `http://127.0.0.1:8787` by default.

## Testing

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

The automated tests include:

- URL safety and SSRF protection.
- Command builder argument-array checks.
- Mock `yt-dlp` analyze and download flows.
- Job queue and progress parsing.
- Signed download token validation and expiry.
- Frontend token, analyze, job creation, polling, completion, and sanitized error flows.

Tests use mock executables and do not download external media.

## Production

```bash
pnpm build
NODE_ENV=production ADMIN_TOKEN=<long-token> pnpm --filter @yt-dlp-web-downloader/server start
```

The server serves built frontend assets from `apps/web/dist` by default. Override with `STATIC_DIR=/path/to/dist` if needed.

Production startup also starts TTL cleanup on the configured interval.

## Configuration

See `.env.example` for all keys. Important defaults:

- `DATA_DIR=./data`
- `JOB_CONCURRENCY=1`
- `FILE_TTL_HOURS=24`
- `CLEANUP_INTERVAL_MINUTES=60`
- `MIN_FREE_DISK_BYTES=5368709120`
- `ENABLE_SSE=false`
- `ENABLE_RANGE_REQUESTS=false`

Downloaded files are stored under `DATA_DIR/jobs/{jobId}` and removed after TTL cleanup.

## API Summary

Public:

- `GET /health` returns `{ ok, time }`.
- `GET /api/download/{token}` streams a completed file when the signed token is valid.

Protected by `Authorization: Bearer <ADMIN_TOKEN>`:

- `GET /api/system/check`
- `POST /api/analyze`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`

Error responses use:

```json
{
  "error": {
    "code": "YTDLP_FAILED",
    "message": "yt-dlp 執行失敗，請稍後再試。",
    "retryable": true
  }
}
```

Frontend-visible errors are normalized and should not include stack traces, local filesystem paths, shell commands, or token values.

## Cloudflare Tunnel

Recommended tunnel target:

```text
Public hostname: video.example.com
Service URL: http://localhost:8787
```

Use Cloudflare Access as the outer protection layer, and keep `ADMIN_TOKEN` enabled as app-level protection. Do not expose this service anonymously.

## Data Retention

- Analysis records expire after a short TTL.
- Download jobs and files expire after `FILE_TTL_HOURS`.
- Cleanup runs every `CLEANUP_INTERVAL_MINUTES`.
- Cleanup only deletes server-generated job directories under `DATA_DIR/jobs`.
- Download tokens are stored as SHA-256 hashes, not plaintext.

## Legal and Safety

Use this only for content you own, are authorized to download, or are allowed to save under the source site's terms. This app does not implement DRM bypass, paywall bypass, browser cookie import, playlist downloads, or multi-user access.

The server rejects non-HTTP URLs, localhost/private-network targets, unsafe DNS resolutions, shell-string command execution, user-controlled filesystem paths, and expired download tokens.

## Current MVP Limits

- Default quality only: best under 1080p, prefer mp4.
- No playlist or batch download.
- No browser cookie import.
- No multi-user accounts.
- No SSE; the frontend uses polling.
- No HTTP range request support yet.

## Troubleshooting

- `GET /api/system/check` shows `yt-dlp`, `ffmpeg`, `ffprobe`, storage writability, and disk space.
- `YTDLP_FAILED`: update `yt-dlp`, then retry.
- `FFMPEG_MISSING`: install `ffmpeg`.
- `INSUFFICIENT_DISK_SPACE`: free disk space or lower `MIN_FREE_DISK_BYTES`.
- `UNSAFE_URL`: the URL points to a blocked local/private network target.

## Manual QA

See `docs/manual-qa.md`.
