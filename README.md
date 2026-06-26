# yt-dlp Web Downloader

Local single-owner web app for analyzing a video URL with `yt-dlp`, running an asynchronous download job, and serving the completed file through an expiring signed link.

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

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

The backend listens on `http://127.0.0.1:8787` by default.

## Production

```bash
pnpm build
NODE_ENV=production ADMIN_TOKEN=<long-token> pnpm --filter @yt-dlp-web-downloader/server start
```

The server serves built frontend assets from `apps/web/dist` by default. Override with `STATIC_DIR=/path/to/dist` if needed.

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

## Cloudflare Tunnel

Recommended tunnel target:

```text
Public hostname: video.example.com
Service URL: http://localhost:8787
```

Use Cloudflare Access as the outer protection layer, and keep `ADMIN_TOKEN` enabled as app-level protection. Do not expose this service anonymously.

## Legal and Safety

Use this only for content you own, are authorized to download, or are allowed to save under the source site's terms. This app does not implement DRM bypass, paywall bypass, browser cookie import, playlist downloads, or multi-user access.

The server rejects non-HTTP URLs, localhost/private-network targets, unsafe DNS resolutions, shell-string command execution, user-controlled filesystem paths, and expired download tokens.

## Troubleshooting

- `GET /api/system/check` shows `yt-dlp`, `ffmpeg`, `ffprobe`, storage writability, and disk space.
- `YTDLP_FAILED`: update `yt-dlp`, then retry.
- `FFMPEG_MISSING`: install `ffmpeg`.
- `INSUFFICIENT_DISK_SPACE`: free disk space or lower `MIN_FREE_DISK_BYTES`.
- `UNSAFE_URL`: the URL points to a blocked local/private network target.

