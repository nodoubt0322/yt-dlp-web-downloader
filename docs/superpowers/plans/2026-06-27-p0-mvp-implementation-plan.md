# P0 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0 MVP for a protected local yt-dlp web downloader with URL analysis, asynchronous download jobs, progress polling, signed downloads, cleanup, and system health checks.

**Architecture:** A Fastify backend owns auth, URL safety, SQLite state, the in-process queue, yt-dlp process execution, file storage, token generation, cleanup, and static asset serving. A React/Vite frontend talks to same-origin protected REST APIs, stores the bearer token in session storage, analyzes one URL at a time, creates jobs, and polls `/api/jobs/{jobId}` until completion.

**Tech Stack:** Node.js 22 LTS, TypeScript, pnpm workspace, Fastify, SQLite via `better-sqlite3`, `execa` or `child_process.spawn` with argument arrays, React, Vite, Vitest, Playwright or equivalent browser testing, yt-dlp, ffmpeg, ffprobe.

---

## Requirement Coverage

P0 covered: `FR-001` through `FR-004`, `FR-010` through `FR-014`, `FR-020` through `FR-022`, `FR-030` through `FR-033`, `FR-040` through `FR-044`, `FR-050`, `FR-051`, `FR-053`, `FR-060` through `FR-062`, `FR-064`, `FR-070` through `FR-072`, `FR-080` through `FR-082`, `SEC-001` through `SEC-010`, `NFR-001` through `NFR-009`.

Deferred as non-goals: `FR-023`, `FR-034`, `FR-045`, `FR-052`, `FR-063`, `FR-073`, cancel UI, delete UI, task history page, Docker Compose, playlist, cookies, subtitles, audio-only extraction, cloud storage, multi-user auth.

## Planned File Structure

- Create: `package.json` for root scripts and package manager metadata.
- Create: `pnpm-workspace.yaml` for `apps/*`.
- Create: `.env.example` for all MVP config keys.
- Create: `README.md` for install, local run, Cloudflare Tunnel, auth, retention, and legal constraints.
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`.
- Create: `apps/server/src/index.ts` for server bootstrap and static serving.
- Create: `apps/server/src/app.ts` for Fastify app construction used by tests.
- Create: `apps/server/src/config.ts` for env parsing and defaults.
- Create: `apps/server/src/routes/health.ts`, `system.ts`, `analyze.ts`, `jobs.ts`, `download.ts`.
- Create: `apps/server/src/middleware/auth.ts`, `rateLimit.ts`.
- Create: `apps/server/src/services/urlSafety.ts`, `commandBuilder.ts`, `ytdlpAdapter.ts`, `progressParser.ts`, `errorNormalizer.ts`, `jobState.ts`, `jobStore.ts`, `jobQueue.ts`, `storageService.ts`, `tokenService.ts`, `cleanupService.ts`, `dependencyCheck.ts`, `contentType.ts`.
- Create: `apps/server/src/db/schema.sql`.
- Create: `apps/server/tests/unit/*.test.ts` for focused service tests.
- Create: `apps/server/tests/integration/*.test.ts` for protected API and mock executable flows.
- Create: `apps/server/tests/fixtures/mock-ytdlp.js`.
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`.
- Create: `apps/web/src/main.tsx`, `App.tsx`, `apiClient.ts`, `auth.ts`, `routes/HomePage.tsx`, `routes/JobPage.tsx`.
- Create: `apps/web/src/components/TokenGate.tsx`, `SystemStatusBanner.tsx`, `UrlSubmitForm.tsx`, `VideoMetadataCard.tsx`, `JobProgressCard.tsx`, `DownloadResultCard.tsx`, `ErrorAlert.tsx`.
- Create: `apps/web/src/styles.css`.
- Create: `apps/web/tests/*.test.tsx` for form, auth, and polling behavior.
- Create: `apps/web/e2e/mvp.spec.ts` for the browser happy path with mocked backend or mock executable.

## Task 1: Workspace and Configuration Foundation

**Requirement IDs:** `NFR-007`, `NFR-009`

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.env.example`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/tests/unit/config.test.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`

- [ ] **Step 1: Write config tests**

Create `apps/server/tests/unit/config.test.ts` with assertions for defaults and required production token:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";

describe("loadConfig", () => {
  it("loads safe MVP defaults for local development", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      ADMIN_TOKEN: "dev-token-with-enough-length",
    });

    expect(config.port).toBe(8787);
    expect(config.jobConcurrency).toBe(1);
    expect(config.analyzeTimeoutMs).toBe(60_000);
    expect(config.fileTtlHours).toBe(24);
    expect(config.enableSse).toBe(false);
    expect(config.enableRangeRequests).toBe(false);
  });

  it("requires ADMIN_TOKEN", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/ADMIN_TOKEN/);
  });
});
```

- [ ] **Step 2: Run the failing config test**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- config.test.ts`

Expected: FAIL because the workspace and `loadConfig` do not exist yet.

- [ ] **Step 3: Create workspace package files**

Create the root and app package files with scripts for `dev`, `build`, `test`, `typecheck`, and `lint`. Use pnpm workspaces and TypeScript strict mode. Root scripts should delegate to both apps.

- [ ] **Step 4: Implement `loadConfig`**

Implement `apps/server/src/config.ts` so all PRD env keys are parsed once, defaults are explicit, booleans parse from `"true"` only, numeric values reject invalid input, and secrets are never logged.

- [ ] **Step 5: Add `.env.example`**

Include `NODE_ENV`, `PORT`, `PUBLIC_BASE_URL`, `ADMIN_TOKEN`, `DATA_DIR`, `JOB_CONCURRENCY`, `ANALYZE_TIMEOUT_SECONDS`, `DOWNLOAD_TIMEOUT_SECONDS`, `FILE_TTL_HOURS`, `CLEANUP_INTERVAL_MINUTES`, `MIN_FREE_DISK_BYTES`, `RATE_LIMIT_ANALYZE_PER_MINUTE`, `RATE_LIMIT_JOB_CREATE_PER_MINUTE`, `ENABLE_SSE=false`, and `ENABLE_RANGE_REQUESTS=false`.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm install
pnpm --filter @yt-dlp-web-downloader/server test -- config.test.ts
pnpm typecheck
```

Expected: all commands pass.

## Task 2: Fastify App, Health, Auth, and Rate Limit

**Requirement IDs:** `SEC-001`, `SEC-002`, `SEC-007`, `SEC-010`, `FR-082`

**Files:**
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/routes/health.ts`
- Create: `apps/server/src/middleware/auth.ts`
- Create: `apps/server/src/middleware/rateLimit.ts`
- Create: `apps/server/tests/integration/auth-health.test.ts`

- [ ] **Step 1: Write route protection tests**

Create tests that call `GET /health`, `GET /api/system/check`, and `POST /api/analyze` through `app.inject()`. Assert `/health` succeeds without auth and `/api/*` returns 401 without `Authorization: Bearer <ADMIN_TOKEN>`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- auth-health.test.ts`

Expected: FAIL because the Fastify app and routes do not exist yet.

- [ ] **Step 3: Implement app construction**

Implement `buildApp(config, services)` in `apps/server/src/app.ts`. Register public `/health`, then register auth and rate-limit hooks for `/api/*`.

- [ ] **Step 4: Implement bearer auth**

Accept only exact `Authorization: Bearer ${ADMIN_TOKEN}`. Return normalized 401 JSON and do not echo tokens.

- [ ] **Step 5: Implement rate limiting**

Add simple in-memory fixed-window rate limits for analyze and job creation based on token hash or IP. Defaults come from config.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --filter @yt-dlp-web-downloader/server test -- auth-health.test.ts
pnpm --filter @yt-dlp-web-downloader/server typecheck
```

Expected: tests and typecheck pass.

## Task 3: URL Safety Validator

**Requirement IDs:** `FR-002`, `FR-003`, `SEC-003`

**Files:**
- Create: `apps/server/src/services/urlSafety.ts`
- Create: `apps/server/tests/unit/urlSafety.test.ts`

- [ ] **Step 1: Write failing validator tests**

Cover valid `http` and `https`, rejected `file:`, `ftp:`, `data:`, `javascript:`, `localhost`, `127.0.0.1`, `10.0.0.1`, `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, `::1`, `fc00::1`, and hostnames that resolve to private IPs through an injected DNS resolver.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- urlSafety.test.ts`

Expected: FAIL because `assertSafeHttpUrl` does not exist.

- [ ] **Step 3: Implement validator**

Expose `assertSafeHttpUrl(input, resolver)` and return a normalized URL string. Use `URL`, reject unsafe protocols, reject hostnames without DNS resolution, resolve A and AAAA records through an injectable resolver, and reject private, loopback, link-local, multicast, and metadata ranges.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @yt-dlp-web-downloader/server test -- urlSafety.test.ts
pnpm --filter @yt-dlp-web-downloader/server typecheck
```

Expected: all validator cases pass.

## Task 4: Dependency and System Check

**Requirement IDs:** `FR-080`, `FR-081`, `FR-082`

**Files:**
- Create: `apps/server/src/services/dependencyCheck.ts`
- Create: `apps/server/src/services/storageService.ts`
- Create: `apps/server/src/routes/system.ts`
- Create: `apps/server/tests/unit/dependencyCheck.test.ts`
- Create: `apps/server/tests/integration/system.test.ts`

- [ ] **Step 1: Write tests**

Unit-test dependency version parsing with injected command runner responses for `yt-dlp --version`, `ffmpeg -version`, and `ffprobe -version`. Integration-test `GET /api/system/check` with auth and assert dependency and storage shape.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- dependencyCheck.test.ts system.test.ts`

Expected: FAIL because services and route do not exist.

- [ ] **Step 3: Implement checks**

Implement command runner injection, dependency status normalization, data directory creation, writability check, and free-space check. Use cross-platform filesystem APIs and keep full paths out of public error messages except configured `dataDir` in system check for the admin.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- dependencyCheck.test.ts system.test.ts`

Expected: tests pass.

## Task 5: yt-dlp Command Builder and Error Normalizer

**Requirement IDs:** `FR-012`, `FR-013`, `FR-014`, `FR-021`, `FR-022`, `FR-042`, `FR-043`, `SEC-004`, `SEC-008`, `SEC-009`

**Files:**
- Create: `apps/server/src/services/commandBuilder.ts`
- Create: `apps/server/src/services/errorNormalizer.ts`
- Create: `apps/server/tests/unit/commandBuilder.test.ts`
- Create: `apps/server/tests/unit/errorNormalizer.test.ts`

- [ ] **Step 1: Write command builder tests**

Assert analyze args equal `["--dump-json", "--no-playlist", "--no-warnings", "--", url]`. Assert download args include `--newline`, `--progress-template`, `-S`, `res:1080`, `--merge-output-format`, `mp4`, controlled `--paths`, controlled `-o`, and URL after `--`. Assert no returned value is a shell command string.

- [ ] **Step 2: Write error normalizer tests**

Map invalid or unsupported URL to `UNSUPPORTED_URL`, login/private video to `AUTH_REQUIRED`, geo restriction to `GEO_RESTRICTED`, network timeout to `NETWORK_TIMEOUT`, process timeout to `DOWNLOAD_TIMEOUT`, missing ffmpeg to `FFMPEG_MISSING`, disk full to `INSUFFICIENT_DISK_SPACE`, and unknown failures to `YTDLP_FAILED`.

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- commandBuilder.test.ts errorNormalizer.test.ts`

Expected: FAIL because command and error services do not exist.

- [ ] **Step 4: Implement services**

Implement pure functions for analyze and download args. Implement normalized error objects with `code`, Chinese `message`, and `retryable`. Strip stack traces, local paths, and tokens from client-facing errors.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- commandBuilder.test.ts errorNormalizer.test.ts`

Expected: tests pass.

## Task 6: Analysis API and Metadata Normalization

**Requirement IDs:** `FR-010`, `FR-011`, `FR-012`, `FR-013`, `FR-014`

**Files:**
- Create: `apps/server/src/services/ytdlpAdapter.ts`
- Create: `apps/server/src/routes/analyze.ts`
- Create: `apps/server/tests/fixtures/mock-ytdlp.js`
- Create: `apps/server/tests/integration/analyze.test.ts`

- [ ] **Step 1: Write integration tests**

Use a mock `yt-dlp` executable or injected adapter that returns stable JSON metadata. Assert protected `POST /api/analyze` returns `analysisId`, title, thumbnail, duration, extractor, webpage URL, recommended options, and format summary. Assert timeout returns `ANALYZE_TIMEOUT`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- analyze.test.ts`

Expected: FAIL because analyze route and adapter do not exist.

- [ ] **Step 3: Implement adapter and route**

Run yt-dlp with argument arrays, timeout via abort signal or process kill, metadata normalization, short analysis TTL persistence, and normalized errors.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @yt-dlp-web-downloader/server test -- analyze.test.ts
pnpm --filter @yt-dlp-web-downloader/server typecheck
```

Expected: tests and typecheck pass.

## Task 7: Job Store and State Machine

**Requirement IDs:** `FR-030`, `FR-031`, `FR-032`, `NFR-004`

**Files:**
- Create: `apps/server/src/db/schema.sql`
- Create: `apps/server/src/services/jobState.ts`
- Create: `apps/server/src/services/jobStore.ts`
- Create: `apps/server/tests/unit/jobState.test.ts`
- Create: `apps/server/tests/unit/jobStore.test.ts`

- [ ] **Step 1: Write tests**

Assert valid transitions: `queued -> running -> completed`, `running -> failed`, `queued -> canceled`, `running -> canceled`, `completed -> expired`, `failed -> expired`, `canceled -> expired`. Assert invalid transitions throw. Assert job records persist and reload from SQLite.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- jobState.test.ts jobStore.test.ts`

Expected: FAIL because state and store do not exist.

- [ ] **Step 3: Implement schema and store**

Create `jobs`, `download_tokens`, and `analyses` tables. Implement create, get, list queued, update status, update progress, complete, fail, and expire operations.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- jobState.test.ts jobStore.test.ts`

Expected: tests pass.

## Task 8: Queue, Progress Parser, and Download Execution

**Requirement IDs:** `FR-033`, `FR-040`, `FR-041`, `FR-044`, `NFR-001`, `NFR-002`

**Files:**
- Create: `apps/server/src/services/progressParser.ts`
- Create: `apps/server/src/services/jobQueue.ts`
- Modify: `apps/server/src/services/ytdlpAdapter.ts`
- Create: `apps/server/tests/unit/progressParser.test.ts`
- Create: `apps/server/tests/integration/jobQueue.test.ts`

- [ ] **Step 1: Write parser and queue tests**

Assert JSON progress lines update percent, downloaded bytes, total bytes, speed, eta, and phase. Assert unparseable lines produce indeterminate progress without failing the job. Assert queue concurrency is 1 and second jobs remain queued while the first runs.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- progressParser.test.ts jobQueue.test.ts`

Expected: FAIL because parser and queue do not exist.

- [ ] **Step 3: Implement queue and download adapter**

Implement single-worker in-process queue, job directory creation, progress parsing from `yt-dlp --newline` output, final file discovery inside the job directory, and completion or failure updates in the store.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- progressParser.test.ts jobQueue.test.ts`

Expected: tests pass.

## Task 9: Jobs API

**Requirement IDs:** `FR-020`, `FR-030`, `FR-031`, `FR-050`, `FR-051`, `FR-053`, `FR-072`

**Files:**
- Create: `apps/server/src/routes/jobs.ts`
- Create: `apps/server/tests/integration/jobs.test.ts`

- [ ] **Step 1: Write API tests**

Assert `POST /api/jobs` accepts an `analysisId` or URL plus default options, rejects unsafe URLs, rejects insufficient disk space, creates a queued job, and returns in under one second with `jobId`. Assert `GET /api/jobs/{jobId}` returns queued, running, completed, and failed shapes.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- jobs.test.ts`

Expected: FAIL because jobs route does not exist.

- [ ] **Step 3: Implement jobs route**

Validate request, check disk threshold, create job with default `bestUnder1080p` options, enqueue it, and expose normalized job status.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- jobs.test.ts`

Expected: tests pass.

## Task 10: Signed Download Tokens and Streaming

**Requirement IDs:** `FR-060`, `FR-061`, `FR-062`, `FR-064`, `SEC-005`, `SEC-006`, `NFR-005`, `NFR-006`

**Files:**
- Create: `apps/server/src/services/tokenService.ts`
- Create: `apps/server/src/services/contentType.ts`
- Create: `apps/server/src/routes/download.ts`
- Create: `apps/server/tests/unit/tokenService.test.ts`
- Create: `apps/server/tests/integration/download.test.ts`

- [ ] **Step 1: Write tests**

Assert tokens have at least 128-bit entropy, only token hashes are stored, expired tokens fail, unknown tokens fail, expired jobs fail, and successful downloads include `Content-Disposition`, `Content-Type`, `Content-Length`, and `Cache-Control: private, no-store`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- tokenService.test.ts download.test.ts`

Expected: FAIL because token and download services do not exist.

- [ ] **Step 3: Implement token and streaming download**

Generate URL-safe random tokens, hash with SHA-256, store only hash, validate TTL and job status, stream files from server-owned job paths, and sanitize download filenames for `Content-Disposition`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- tokenService.test.ts download.test.ts`

Expected: tests pass.

## Task 11: TTL Cleanup and Storage Guardrails

**Requirement IDs:** `FR-070`, `FR-071`, `NFR-008`

**Files:**
- Modify: `apps/server/src/services/storageService.ts`
- Create: `apps/server/src/services/cleanupService.ts`
- Create: `apps/server/tests/unit/storageService.test.ts`
- Create: `apps/server/tests/unit/cleanupService.test.ts`

- [ ] **Step 1: Write cleanup tests**

Assert cleanup deletes expired job directories only under `DATA_DIR/jobs/{jobId}`, marks jobs expired, removes temp directories, ignores active jobs, and refuses paths that resolve outside `DATA_DIR/jobs`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- storageService.test.ts cleanupService.test.ts`

Expected: FAIL because cleanup behavior does not exist.

- [ ] **Step 3: Implement cleanup service**

Schedule cleanup based on `CLEANUP_INTERVAL_MINUTES`, expose a callable `runCleanupOnce()` for tests, and use allowlisted job IDs plus resolved-path checks before deletion.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/server test -- storageService.test.ts cleanupService.test.ts`

Expected: tests pass.

## Task 12: Frontend Auth, System Status, and URL Analysis

**Requirement IDs:** `FR-001`, `FR-004`, `FR-010`, `FR-011`, `FR-014`, `FR-080`, `FR-081`, `SEC-001`, `SEC-009`

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/apiClient.ts`
- Create: `apps/web/src/auth.ts`
- Create: `apps/web/src/routes/HomePage.tsx`
- Create: `apps/web/src/components/TokenGate.tsx`
- Create: `apps/web/src/components/SystemStatusBanner.tsx`
- Create: `apps/web/src/components/UrlSubmitForm.tsx`
- Create: `apps/web/src/components/VideoMetadataCard.tsx`
- Create: `apps/web/src/components/ErrorAlert.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/tests/home.test.tsx`

- [ ] **Step 1: Write frontend tests**

Assert token is stored in `sessionStorage`, empty and invalid URL values show client-side errors, ownership warning copy is visible, system check failures are displayed in Chinese, and successful analyze renders title, thumbnail, duration, extractor, and default download action.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/web test -- home.test.tsx`

Expected: FAIL because the frontend app does not exist.

- [ ] **Step 3: Implement frontend foundation**

Build a compact operational UI, avoid marketing layout, keep token entry clear, call same-origin APIs through `apiClient`, and show normalized error messages only.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @yt-dlp-web-downloader/web test -- home.test.tsx
pnpm --filter @yt-dlp-web-downloader/web typecheck
```

Expected: tests and typecheck pass.

## Task 13: Frontend Job Polling and Download Result

**Requirement IDs:** `FR-020`, `FR-050`, `FR-051`, `FR-053`, `FR-060`, `FR-064`

**Files:**
- Modify: `apps/web/src/routes/HomePage.tsx`
- Create: `apps/web/src/routes/JobPage.tsx`
- Create: `apps/web/src/components/JobProgressCard.tsx`
- Create: `apps/web/src/components/DownloadResultCard.tsx`
- Create: `apps/web/tests/job.test.tsx`

- [ ] **Step 1: Write frontend job tests**

Assert creating a job navigates to `/jobs/{jobId}`, job page polls every 1-3 seconds while queued or running, polling stops on completed or failed, completed jobs show download URL and expiration copy, and failed jobs show sanitized Chinese error text.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @yt-dlp-web-downloader/web test -- job.test.tsx`

Expected: FAIL because job page and components do not exist.

- [ ] **Step 3: Implement job UI**

Use route state or URL params to fetch job status. Render states `queued`, `running`, `completed`, `failed`, `canceled`, and `expired` with distinct copy. Do not implement cancel or delete controls in P0.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @yt-dlp-web-downloader/web test -- job.test.tsx`

Expected: tests pass.

## Task 14: End-to-End Flow with Mock yt-dlp

**Requirement IDs:** all P0 API, job, auth, download, and frontend flow requirements

**Files:**
- Create: `apps/web/e2e/mvp.spec.ts`
- Modify: `apps/server/tests/fixtures/mock-ytdlp.js`
- Modify: root `package.json`

- [ ] **Step 1: Write E2E test**

Automate token entry, URL submission, analysis result display, job creation, progress display, completed download button display, and unauthorized API rejection. Use mock yt-dlp behavior and local test data only.

- [ ] **Step 2: Run E2E to verify failure**

Run: `pnpm e2e`

Expected: FAIL until server, web app, and test harness are wired together.

- [ ] **Step 3: Wire test harness**

Add scripts that build the frontend, start the backend with mock executable paths and test env, run the browser test, and stop the server.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: all commands pass.

## Task 15: README, Manual QA, and Production Build

**Requirement IDs:** `SEC-009`, `NFR-009`, Cloudflare Tunnel deployment requirements, PRD Definition of Done

**Files:**
- Create: `README.md`
- Create: `docs/manual-qa.md`
- Modify: root `package.json`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write docs**

Document Node 22, pnpm, yt-dlp, ffmpeg, ffprobe, env setup, app token auth, session storage behavior, local start, production build, Cloudflare Tunnel hostname to `http://localhost:8787`, data retention, cleanup, legal constraints, and troubleshooting.

- [ ] **Step 2: Serve production frontend**

Configure the backend to serve the built `apps/web/dist` assets in production and fall back to the frontend route for `/` and `/jobs/{jobId}`.

- [ ] **Step 3: Write manual QA checklist**

Include checks for system check, unauthorized API rejection, SSRF rejection, command injection string rejection, analyze flow, job flow, signed download, token expiry, cleanup boundaries, and Cloudflare Tunnel access with auth.

- [ ] **Step 4: Verify final MVP**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: all automated checks pass. Manual QA is recorded in `docs/manual-qa.md` after browser and tunnel verification.

## Final Acceptance

- All P0 requirements in `yt-dlp-web-downloader-prd.md` are implemented or have a documented manual acceptance check.
- Automated tests use mock executables or adapter mocks and do not download external media.
- API and file download surfaces are protected by auth or unguessable signed tokens.
- The app rejects SSRF inputs and never builds shell command strings.
- Files are written and deleted only under server-generated job directories.
- The frontend provides Chinese user-facing safety copy and readable errors.
- `.env.example` and `README.md` are complete enough for local owner deployment behind Cloudflare Tunnel.
