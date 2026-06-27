# Manual QA Checklist

## Local

- [ ] Run `pnpm install`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Start production server:

```bash
NODE_ENV=production ADMIN_TOKEN=test-admin-token pnpm --filter @yt-dlp-web-downloader/server start
```

- [ ] Open `http://127.0.0.1:8787`.
- [ ] Enter the admin token; refresh and confirm the token remains only for this browser session.
- [ ] Confirm system status shows `yt-dlp 版本號`, `ffmpeg`, and `ffprobe`, without a storage row.
- [ ] Submit an invalid URL and confirm a Chinese validation error.
- [ ] Submit `http://127.0.0.1/` and confirm SSRF protection rejects it.
- [ ] Submit a URL you have permission to download and confirm analysis metadata renders.
- [ ] Start the default download and confirm the job status appears on the home page without navigating away.
- [ ] Confirm queued/running/completed or failed states render clearly.
- [ ] When completed, click the signed download link and confirm the file streams from `/api/download/{token}`.
- [ ] Confirm the response includes `Content-Disposition`, `Content-Type`, `Content-Length`, and `Cache-Control: private, no-store`.
- [ ] Confirm no frontend error displays raw stack traces, local filesystem paths, shell commands, or token values.

## Cloudflare Tunnel

- [ ] Create a Cloudflare Tunnel public hostname that points to `http://localhost:8787`.
- [ ] Enable Cloudflare Access for the public hostname.
- [ ] Visit the public hostname from an external network and confirm Cloudflare Access blocks anonymous access.
- [ ] After Access login, enter the app token and repeat analyze -> job -> polling -> signed download.
- [ ] Confirm anonymous requests to `/api/system/check`, `/api/analyze`, and `/api/jobs` return unauthorized responses.
