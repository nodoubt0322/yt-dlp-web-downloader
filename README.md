# yt-dlp Web Downloader

本專案是一個本機單一擁有者使用的 Web App：輸入影片 URL 後，後端使用 `yt-dlp` 分析影片、建立非同步下載任務，並透過有期限的簽章連結提供完成後的檔案下載。

## 功能概要

1. 在 Web UI 輸入一個影片 URL。
2. 後端驗證 URL、阻擋 private network 目標，並用 `yt-dlp --dump-json` 分析 metadata。
3. 選擇品質後建立下載任務。
4. 後端以 concurrency `1` 非同步執行任務，將檔案寫入 `DATA_DIR/jobs/{jobId}`，並追蹤進度。
5. 任務完成後，App 顯示有期限的 signed download URL。

此工具設計給單一擁有者在本機執行，也可選擇透過 Cloudflare Tunnel 對外存取。它不是匿名公開下載服務。

## 系統需求

- Node.js 22+，且需支援 `node:sqlite`。目前開發驗證環境為 Node `v26.4.0`。
- pnpm 11+
- `yt-dlp`
- `ffmpeg`
- `ffprobe`

在 macOS 安裝影音工具：

```bash
brew install yt-dlp ffmpeg
```

當網站規則變更時，更新 `yt-dlp`：

```bash
brew upgrade yt-dlp
```

## 安裝

```bash
pnpm install
cp .env.example .env
```

請在 `.env` 裡把 `ADMIN_TOKEN` 設成足夠長的隨機值。API route 需要：

```text
Authorization: Bearer <ADMIN_TOKEN>
```

瀏覽器 UI 會把 token 存在 `sessionStorage`，不會寫入 `localStorage`。

## 快速啟動

本機開發：

```bash
pnpm install
ADMIN_TOKEN=dev-token pnpm dev
```

開啟：

```text
http://127.0.0.1:8787
```

使用受保護的 API 操作前，先在 UI token 欄位輸入 `dev-token`。

## 開發指令

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

後端預設監聽 `http://127.0.0.1:8787`。

## 測試

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

自動化測試涵蓋：

- URL safety 與 SSRF 防護。
- Command builder 的 argument-array 檢查。
- Mock `yt-dlp` 分析與下載流程。
- Job queue 與 progress parsing。
- Signed download token 驗證與過期。
- 前端 token、分析、建立任務、polling、完成狀態與 sanitized error 流程。

測試使用 mock executable，不會下載外部媒體。

## Production

```bash
pnpm build
NODE_ENV=production ADMIN_TOKEN=<long-token> pnpm --filter @yt-dlp-web-downloader/server start
```

server 預設會提供 `apps/web/dist` 裡的 built frontend assets。需要時可用 `STATIC_DIR=/path/to/dist` 覆寫。

production 啟動時也會依設定的 interval 啟動 TTL cleanup。

## 設定

所有設定鍵請參考 `.env.example`。重要預設值：

- `DATA_DIR=./data`
- `JOB_CONCURRENCY=1`
- `FILE_TTL_MINUTES=3`
- `CLEANUP_INTERVAL_MINUTES=60`
- `MIN_FREE_DISK_BYTES=5368709120`
- `ENABLE_SSE=false`
- `ENABLE_RANGE_REQUESTS=false`

下載完成的檔案會存放在 `DATA_DIR/jobs/{jobId}`，並在 TTL cleanup 後移除。

## API 摘要

公開 endpoint：

- `GET /health` 回傳 `{ ok, time }`。
- `GET /api/download/{token}` 在 signed token 有效時串流完成檔案。

需要 `Authorization: Bearer <ADMIN_TOKEN>` 保護：

- `GET /api/system/check`
- `POST /api/analyze`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`

錯誤回應格式：

```json
{
  "error": {
    "code": "YTDLP_FAILED",
    "message": "yt-dlp 執行失敗，請稍後再試。",
    "retryable": true
  }
}
```

前端可見錯誤都會 normalized，不應包含 stack trace、本機檔案路徑、shell command 或 token 值。

## Cloudflare Tunnel

建議 tunnel target：

```text
Public hostname: video.example.com
Service URL: http://localhost:8787
```

建議使用 Cloudflare Access 作為外層保護，並保留 `ADMIN_TOKEN` 作為 app-level 防護。不要把此服務匿名公開。

## 資料保留

- Analysis record 會在短 TTL 後過期。
- Download job 與檔案會在 `FILE_TTL_MINUTES` 後過期，預設 3 分鐘。
- Cleanup 每 `CLEANUP_INTERVAL_MINUTES` 執行一次。
- Cleanup 只會刪除 `DATA_DIR/jobs` 底下由 server 產生的 job 目錄。
- Download token 只儲存 SHA-256 hash，不儲存明文 token。

## 法務與安全

請只用此工具下載你擁有、已取得授權，或來源網站條款允許保存的內容。本 App 不提供 DRM 繞過、付費牆繞過、瀏覽器 cookie 匯入、playlist 下載或多使用者存取。

server 會拒絕非 HTTP URL、localhost/private-network 目標、不安全 DNS 解析結果、shell-string command execution、使用者控制的檔案路徑，以及過期 download token。

## 目前 MVP 限制

- 支援品質選項：最佳可用、1080p 以下最佳、720p 以下最佳、480p 以下最佳；輸出仍優先合併為 mp4。
- 不支援 playlist 或批次下載。
- 不支援瀏覽器 cookie 匯入。
- 不支援多使用者帳號。
- 不支援 SSE；前端使用 polling。
- 尚未支援 HTTP range request。

## 疑難排解

- `GET /api/system/check` 會回傳 `yt-dlp`、`ffmpeg`、`ffprobe` 與 storage 狀態；前端只顯示工具版本。
- `YTDLP_FAILED`：更新 `yt-dlp` 後重試。
- `FFMPEG_MISSING`：安裝 `ffmpeg`。
- `INSUFFICIENT_DISK_SPACE`：釋放磁碟空間，或降低 `MIN_FREE_DISK_BYTES`。
- `UNSAFE_URL`：URL 指向被阻擋的 local/private network 目標。

## Manual QA

請參考 `docs/manual-qa.md`。
