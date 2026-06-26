# P0 MVP Tasks

Source: `yt-dlp-web-downloader-prd.md`

Scope: P0/MVP only. P1/P2 features remain deferred unless a task explicitly says they are a non-goal.

## Milestone 1: Project Skeleton and Security Foundation

- [x] Create pnpm workspace with `apps/server` and `apps/web`.
- [x] Add `.env.example` with all PRD MVP config keys.
- [x] Implement server config loading and validation.
- [x] Add Fastify app bootstrap.
- [x] Add public `GET /health`.
- [x] Add bearer-token auth for all `/api/*` routes.
- [x] Add same-origin CORS default and explicit dev-origin support only through config.
- [x] Add rate limits for analyze and job creation.
- [x] Add URL safety validator for protocols, localhost, private IPv4, private IPv6, link-local, metadata IP, and DNS-resolved private addresses.
- [x] Add system dependency and storage checks for `yt-dlp`, `ffmpeg`, `ffprobe`, writable data dir, and free disk space.

## Milestone 2: yt-dlp Analysis

- [x] Add yt-dlp analyze command builder using argument arrays.
- [ ] Add yt-dlp adapter with analyze timeout.
- [ ] Add metadata normalization for title, thumbnail, duration, extractor, webpage URL, recommended options, and format summary.
- [x] Add normalized error mapping for unsupported URL, auth required, geo restriction, network timeout, analyze timeout, disk space, and unknown yt-dlp failures.
- [ ] Add protected `POST /api/analyze`.
- [ ] Test analyze with a mock executable or adapter mock.

## Milestone 3: Job Queue and Download Execution

- [x] Add SQLite schema for `jobs`, `download_tokens`, and `analyses`.
- [x] Add job state machine with `queued`, `running`, `completed`, `failed`, `canceled`, and `expired`.
- [x] Add durable job store.
- [x] Add download command builder using argument arrays, server-generated job paths, `--`, `--newline`, progress template, best-under-1080p sorting, and mp4 merge preference.
- [ ] Add progress parser for percent, downloaded bytes, total bytes, speed, eta, and phase.
- [ ] Add in-process queue with default concurrency 1.
- [ ] Add protected `POST /api/jobs`.
- [ ] Add protected `GET /api/jobs/{jobId}`.
- [ ] Reject new jobs when free disk space is below threshold.

## Milestone 4: Signed Download and Cleanup

- [ ] Add signed download token generation with at least 128-bit entropy.
- [ ] Store only token hashes.
- [ ] Add protected job result shape with download URL and expiration.
- [ ] Add `GET /api/download/{token}` streaming endpoint.
- [ ] Add download headers: `Content-Disposition`, `Content-Type`, `Content-Length`, and `Cache-Control: private, no-store`.
- [ ] Reject expired, unknown, or expired-job download tokens without exposing file paths.
- [x] Add TTL cleanup that marks jobs expired.
- [x] Ensure cleanup only deletes server-generated job directories under `DATA_DIR/jobs`.

## Milestone 5: Frontend MVP

- [x] Add React/Vite app.
- [ ] Store app token in `sessionStorage`, not `localStorage`.
- [ ] Add system status banner.
- [ ] Add URL input and analyze button.
- [ ] Show required safety copy: `請只下載你擁有權利或已取得授權的內容；本工具不支援 DRM 或付費牆繞過。`
- [ ] Render analysis metadata card.
- [ ] Allow default-quality download without manual format selection.
- [ ] Route job status to `/jobs/{jobId}`.
- [ ] Poll `GET /api/jobs/{jobId}` every 1-3 seconds while queued or running.
- [ ] Show queued, running, completed, failed, canceled, and expired states.
- [ ] Show signed download link and expiration copy after completion.
- [ ] Show sanitized Chinese error messages.

## Milestone 6: Verification and Documentation

- [ ] Add unit tests for URL validator, command builder, job state machine, token service, storage guardrails, cleanup, and error normalizer.
- [ ] Add integration tests for unauthorized API rejection, analyze with mock yt-dlp, job progress with mock yt-dlp, completed download, system check, and missing dependency cases.
- [ ] Add E2E test for token entry, analyze, job creation, progress, completed download action, and readable failure path.
- [ ] Add README with install, dependencies, env, auth, local start, production build, Cloudflare Tunnel, data retention, legal constraints, and troubleshooting.
- [ ] Add manual QA checklist for local browser and Cloudflare Tunnel validation.
- [ ] Verify final MVP with `pnpm test`, `pnpm typecheck`, `pnpm build`, and E2E tests.
