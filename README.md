# yt-dlp Web Downloader

這是一個供「本機單一擁有者」使用的影片下載器。使用者在 Web UI 貼上影片 URL，後端先用 `yt-dlp` 讀取 metadata，確認後建立非同步下載任務；下載完成後再用 `ffmpeg` 做保守壓縮，最後用短效 signed URL 提供檔案下載。

核心理念是：操作在瀏覽器，但真正的下載、轉檔、保存與安全檢查都在本機後端完成。這不是匿名公開下載服務，也不是多使用者 SaaS。

## 功能概要

- Web UI 輸入影片 URL，先分析 metadata，再建立下載任務。
- 下載品質可選：原始畫質、1080p、720p、480p。
- 如果來源沒有選擇的解析度，前端會提示實際可取得的解析度。
- 後端使用 FIFO queue，以 concurrency `1` 執行下載任務，避免本機資源被多個重型下載同時打滿。
- `yt-dlp` 下載失敗時會最多重試 3 次，重試訊息會回傳給前端顯示。
- 下載完成後用 `ffmpeg` 壓縮影片，在畫質不明顯犧牲的前提下盡量減小檔案。
- 壓縮後如果檔案沒有變小，會保留原始下載檔，不會為了壓縮而產生更大的結果。
- 完成檔案只保留短時間，預設 3 分鐘。
- 下載連結過期後，前端會在同頁顯示中文提示，不會跳到 raw JSON 錯誤頁。
- Web UI 只顯示系統是否正常，不暴露 `yt-dlp`、`ffmpeg`、`ffprobe` 的版本細節給一般使用者。
- API 錯誤會 normalized，避免把本機路徑、token、shell command、stack trace 洩漏到前端。

## 使用者流程

```text
1. 開啟 Web UI
2. 輸入管理 Token
3. 貼上影片 URL
4. 點「分析」
5. 前端顯示標題、URL、縮圖、長度與可選畫質
6. 選擇品質
7. 建立下載任務
8. 前端輪詢 job 狀態
9. 後端下載、重試、壓縮、建立 signed download token
10. 前端顯示檔案大小、過期時間、處理時間與下載按鈕
11. 使用者下載檔案
12. 超過 TTL 後，下載 token 與檔案失效
```

首頁不跳轉到獨立下載頁；分析、建立任務、處理狀態、完成下載都會在同一個主要工作流中呈現。

## 系統架構

```text
Browser / React UI
  |
  |  Authorization: Bearer <ADMIN_TOKEN>
  v
Fastify API server
  |
  +-- /api/system/check    檢查本機依賴與 storage
  +-- /api/analyze         驗證 URL，呼叫 yt-dlp --dump-json
  +-- /api/jobs            建立下載 job
  +-- /api/jobs/{jobId}    輪詢 job 狀態
  +-- /api/download/{tok}  signed token 檔案下載
  |
  +-- JobStore             node:sqlite 狀態資料庫
  +-- JobQueue             FIFO 非同步下載佇列
  +-- StorageService       DATA_DIR/jobs/{jobId}
  +-- TokenService         SHA-256 hashed download token
  +-- CleanupService       TTL 後清除 job 與檔案
  |
  +-- yt-dlp               metadata / download
  +-- ffmpeg               下載後壓縮
  +-- ffprobe              系統依賴檢查
```

### 前端

前端是 Vite + React。

主要檔案：

- `apps/web/src/App.tsx`
  - 用 `window.location.pathname` 做很輕量的 route 判斷。
  - `/jobs/{jobId}` 顯示獨立 job 狀態頁。
  - `/` 顯示首頁工作流。
- `apps/web/src/routes/HomePage.tsx`
  - 管理 token。
  - 查詢系統狀態。
  - 分析 URL。
  - 顯示 metadata。
  - 建立下載任務。
  - 在首頁嵌入 job 狀態。
  - 未設定 token 時按「分析」會先提示設定 token，不送出請求，避免 401 被誤認為伺服器錯誤。
  - 手機版單欄順序固定為「分析表單 → 結果／下載 → 系統狀態」。
- `apps/web/src/routes/JobPage.tsx`
  - 讀取單一 job。
  - 每 2 秒 polling，直到 job 進入 terminal status。
  - terminal status 包含 `completed`、`failed`、`expired`。
- `apps/web/src/components/JobProgressCard.tsx`
  - 顯示等待、處理、重試、完成與過期訊息。
  - 顯示處理時間。
  - 攔截「下載檔案」點擊，用 `fetch` 下載檔案。
  - 如果下載 token 過期，顯示 `下載連結已過期，請重新建立下載任務。`，不讓瀏覽器導到 JSON API 回應。
- `apps/web/src/components/VideoMetadataCard.tsx`
  - 顯示標題、URL、縮圖、長度與品質選單。
  - 長度以「X分Y秒」顯示，秒數四捨五入。
  - 品質選單只顯示 `原始畫質`、`1080p`、`720p`、`480p`，不顯示估算檔案大小。
- `apps/web/src/components/TokenGate.tsx`
  - 桌機在側欄以面板管理 token。
  - 手機版收進 masthead 右上角齒輪，點擊以置中 `<dialog>` 彈出管理，齒輪上的小圓點標示是否已設定。
- `apps/web/src/components/SystemStatusBanner.tsx` 與 `apps/web/src/components/SystemStatusPill.tsx`
  - 桌機顯示完整系統狀態面板。
  - 手機版改以齒輪左側的精簡狀態藥丸（`狀態 可用` 等）顯示；僅在系統有問題時才保留完整問題明細面板，避免隱藏失敗。
- `apps/web/src/useMediaQuery.ts`
  - 提供手機／桌機結構互斥切換（如 token 面板與 dialog），避免兩者同時存在於 DOM。
- `apps/web/src/useHomeMotion.ts`
  - 使用 GSAP / anime.js 做首頁入場與細節動效。

### 後端

後端是 Fastify + TypeScript。

主要檔案：

- `apps/server/src/server.ts`
  - 建立 Fastify app。
  - 註冊 auth、rate limit、API routes、static assets。
  - production 或有 `staticDir` 時，會服務 built frontend，並把非 API GET fallback 到 `index.html`。
- `apps/server/src/config.ts`
  - 讀取環境變數與預設值。
  - 包含 `YT_DLP_BINARY`、`FFMPEG_BINARY`、`FFPROBE_BINARY`、`DATA_DIR`、TTL、timeout、rate limit 等。
- `apps/server/src/routes/analyze.ts`
  - 驗證 URL。
  - 呼叫 `yt-dlp --dump-json`。
  - 儲存 analysis record，供後續 `analysisId` 建立 job。
- `apps/server/src/routes/jobs.ts`
  - 建立 job。
  - 檢查磁碟空間。
  - 從 URL 或 analysisId 建立下載任務。
  - 回傳 job polling 狀態。
- `apps/server/src/routes/download.ts`
  - 驗證 signed download token。
  - token 或 job 過期時回 `410 DOWNLOAD_EXPIRED`。
  - 成功時用 safe `Content-Disposition` 串流檔案。
- `apps/server/src/services/jobQueue.ts`
  - FIFO queue。
  - 執行 `yt-dlp` 下載。
  - 失敗最多重試 3 次。
  - 下載完成後執行 `ffmpeg` 壓縮。
  - 建立短效 download token。
- `apps/server/src/services/ytdlpAdapter.ts`
  - 將 `yt-dlp --dump-json` 結果 normalize 成前端使用的 metadata。
  - 從 formats 推導最高解析度、影音狀態與品質估算資料。
- `apps/server/src/services/commandBuilder.ts`
  - 集中建立 `yt-dlp` 與 `ffmpeg` argument array。
  - 不使用 shell string，避免 shell injection。
- `apps/server/src/services/jobStore.ts`
  - 使用 `node:sqlite` 儲存 jobs、analyses、download tokens。
- `apps/server/src/services/tokenService.ts`
  - 建立與驗證 `dl_...` token。
  - DB 只存 SHA-256 hash，不存明文 token。
- `apps/server/src/services/storageService.ts`
  - 限制所有 job 檔案都在 `DATA_DIR/jobs/{jobId}`。
  - 排除 `.part`、`.tmp`、`.ytdl` 等暫存檔。
- `apps/server/src/services/cleanupService.ts`
  - TTL 後標記 job expired 並刪除 job 目錄。

## 下載與處理原理

### 1. URL safety

`/api/analyze` 和 `/api/jobs` 都會檢查 URL：

- 只接受 HTTP / HTTPS URL。
- 阻擋 localhost。
- 阻擋 private network / loopback / link-local 等不安全目標。
- 解析 DNS 後仍會檢查解析結果，避免使用者用網域繞過 private IP 防護。

這是為了避免把本機 server 變成 SSRF 工具。

### 2. Metadata 分析

分析階段只讀 metadata，不下載影片：

```bash
yt-dlp --dump-json --no-playlist --playlist-items 1 --no-warnings -- <url>
```

後端會 normalize：

- `title`
- `thumbnail`
- `durationSeconds`
- `extractor`
- `webpageUrl`
- `formatSummary`
  - 是否有影像
  - 是否有音訊
  - 最高解析度
  - container extension
  - 品質估算資料

前端目前不顯示來源、格式與品質估算檔案大小，以免 metadata 佔據主要操作區，也避免使用者把估算值誤認為最終產出大小。最終大小一律以實際下載並壓縮後的結果為準。

### 3. 畫質選擇

前端提供四個選項：

- `原始畫質`
- `1080p`
- `720p`
- `480p`

後端對應的 `yt-dlp` format selector：

```text
原始畫質: bv*+ba/b
1080p:   bv*[height<=1080]+ba/b[height<=1080]/b
720p:    bv*[height<=720]+ba/b[height<=720]/b
480p:    bv*[height<=480]+ba/b[height<=480]/b
```

並搭配 `-S res` / `res:1080` / `res:720` / `res:480` 讓 `yt-dlp` 優先挑選合適解析度。

所有下載都會加上：

```text
--merge-output-format mp4
--no-playlist
--newline
--progress-template download:%(progress)j
```

`--progress-template` 讓後端可以解析 progress JSON，前端再顯示百分比、速度、剩餘時間與已下載大小。

### 4. Job queue

Job queue 是 FIFO：

```text
job A queued -> running -> completed/failed
job B queued -> running -> completed/failed
```

即使同時建立多個 job，也會一個一個執行。這是因為 `yt-dlp` + `ffmpeg` 都可能消耗 CPU、磁碟與網路，並行太多對本機工具反而不穩。

目前 `JOB_CONCURRENCY` 預設為 `1`，實作上也以單一 tail promise 串接任務。

### 5. yt-dlp retry

下載階段如果 `yt-dlp` 失敗，會最多重試 3 次。

重試時後端會更新 job progress：

```json
{
  "phase": "retrying",
  "message": "下載失敗，正在重試（第 1/3 次）",
  "retryAttempt": 1,
  "retryMax": 3
}
```

完整 `yt-dlp` 失敗細節會寫入 log；server terminal 只顯示簡短摘要與 log 路徑，避免大量 stderr 或 progress JSON 洗版。

- 分析失敗 log：`DATA_DIR/logs/yt-dlp-analyze.log`
- 下載失敗 log：`DATA_DIR/jobs/{jobId}/yt-dlp.log`

### 6. ffmpeg 下載後壓縮

`yt-dlp` 下載完成後，後端會在 job 暫存目錄產生 optimized 檔：

```bash
ffmpeg \
  -y \
  -i <input.mp4> \
  -map 0:v:0 \
  -map 0:a? \
  -c:v libx264 \
  -preset medium \
  -crf 28 \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  <input.mp4.optimized.mp4>
```

設計原則：

- 使用 H.264 (`libx264`) 保持相容性。
- 使用 CRF 28 讓檔案盡量縮小，但避免極端糊化。
- 使用 `preset medium` 在速度與壓縮效率之間折衷。
- 音訊轉成 AAC 128k。
- `+faststart` 讓 mp4 metadata 放前面，對網頁與一般播放器更友善。

壓縮完成後會比較檔案大小：

```text
optimized.size < original.size -> 用 optimized 取代 original
optimized.size >= original.size -> 刪掉 optimized，保留 original
```

所以壓縮步驟不會讓最終檔案變得更大。

壓縮中前端會看到：

```text
正在壓縮影片，降低檔案大小...
```

壓縮結束後，這個 live message 會被清除，完成狀態只顯示實際完成檔案資訊。

### 7. Signed download URL

下載任務完成後，後端會建立短效 token：

```text
/api/download/dl_<random>
```

DB 只儲存 token hash：

```text
SHA-256(token)
```

明文 token 只存在完成 response 的 `downloadUrl` 裡，不寫入 DB。

token 與 job 都會受 TTL 限制。任一過期，`GET /api/download/{token}` 會回：

```json
{
  "error": {
    "code": "DOWNLOAD_EXPIRED",
    "message": "Download link expired"
  }
}
```

前端不會讓使用者直接跳到這個 JSON。`JobProgressCard` 會攔截下載點擊，用 `fetch` 下載：

- `200`：建立 object URL，觸發瀏覽器下載。
- `410`：留在原頁，顯示 `下載連結已過期，請重新建立下載任務。`
- 其他失敗：顯示 `下載失敗，請稍後再試。`

## 資料生命週期

```text
Analysis:
  POST /api/analyze
  -> jobStore.createAnalysis(...)
  -> TTL 約 1 小時

Job:
  POST /api/jobs
  -> queued
  -> running
  -> completed / failed / expired

File:
  DATA_DIR/jobs/{jobId}/{filename}.mp4
  -> 完成後可透過 signed token 下載
  -> FILE_TTL_MINUTES 後失效
  -> CleanupService 刪除 job 目錄

Download token:
  token 明文只回給前端
  DB 只存 token hash
  token expiresAt 預設與 job 檔案 TTL 對齊
```

預設檔案 TTL 為 3 分鐘；這個工具定位為本機短暫中轉，不是長期媒體庫。

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

請在 `.env` 裡把 `ADMIN_TOKEN` 設成足夠長的隨機值。

所有受保護 API 都需要：

```text
Authorization: Bearer <ADMIN_TOKEN>
```

瀏覽器 UI 會把 token 存在 `sessionStorage`，不會寫入 `localStorage`。關掉該 tab/session 後需要重新輸入。

## 快速啟動

本機開發：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

開啟：

```text
http://127.0.0.1:5173
```

`pnpm dev` 只會讀取根目錄 `.env`。本地開發請讓 `.env` 使用 `PORT=8788`，避免跟對外 tunnel API 的 `8787` 衝突。操作受保護 API 前，先在 UI token 欄位輸入 `.env` 裡的 token。

`pnpm dev` 會同時啟動：

```text
api: http://127.0.0.1:8788
web: http://127.0.0.1:5173
```

開發時請打開 `5173`。Vite 會提供 hot reload，並把 `/api` 代理到本地開發後端。

如果後端程式碼更動後行為沒有更新，確認 `tsx watch` 是否仍在運作；必要時重跑 `pnpm dev`。

## 開發指令

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

單獨啟動：

```bash
pnpm dev:api
pnpm dev:web
```

對外 API + Cloudflare Tunnel 使用獨立指令；一般 `pnpm dev` 不會公開本機服務：

```bash
pnpm api:tunnel
```

單獨跑 package：

```bash
pnpm --filter @yt-dlp-web-downloader/server test
pnpm --filter @yt-dlp-web-downloader/web test
pnpm --filter @yt-dlp-web-downloader/server typecheck
pnpm --filter @yt-dlp-web-downloader/web typecheck
```

## 測試策略

完整驗證：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

自動化測試涵蓋：

- URL safety 與 SSRF 防護。
- Command builder 的 argument-array 檢查。
- `yt-dlp --dump-json` metadata normalize。
- 品質選擇與 format summary。
- Mock `yt-dlp` 分析與下載流程。
- Mock `ffmpeg` 壓縮流程。
- Job queue FIFO 行為。
- `yt-dlp` 失敗 retry 與前端 retry message。
- ffmpeg optimized 檔案更小時取代原檔。
- ffmpeg optimized 檔案不更小時保留原檔。
- Progress parsing。
- Signed download token 驗證與過期。
- 過期下載連結不導到 raw JSON，前端顯示中文提示。
- 前端 token、分析、建立任務、polling、完成狀態與 sanitized error 流程。

測試使用 mock executable：

- `apps/server/test-fixtures/mock-ytdlp.mjs`
- `apps/server/test-fixtures/mock-ffmpeg.mjs`

測試不會下載外部媒體。

## Production

```bash
pnpm build
dotenv -e .env.production -e .env -- pnpm --filter @yt-dlp-web-downloader/server start
```

server 預設會提供 `apps/web/dist` 裡的 built frontend assets。需要時可用 `STATIC_DIR=/path/to/dist` 覆寫。

production 啟動時會依設定的 interval 啟動 TTL cleanup。

建議 production 至少設定：

```bash
NODE_ENV=production
ADMIN_TOKEN=<long-random-token>
DATA_DIR=/absolute/path/to/data
PUBLIC_BASE_URL=https://dlp-api.example.com
ALLOWED_ORIGINS=https://dlp.example.com
```

如果使用 Cloudflare Tunnel 或 reverse proxy，`PUBLIC_BASE_URL` 可讓產出的 `downloadUrl` 使用外部網址；`ALLOWED_ORIGINS` 讓 Cloudflare Pages frontend 可以跨網域呼叫本機 API。一般本機開發可省略，前端會使用相對路徑與 Vite proxy。

## Cloudflare 部署

目前預設部署目標：

```text
Frontend: https://dlp.example.com
API:      https://dlp-api.example.com
Origin:   http://127.0.0.1:8787
```

前端部署到 Cloudflare Pages，後端仍跑在本機，並透過 Cloudflare Tunnel 暴露 API hostname。不要把 Pages 與 Tunnel 共用同一個 hostname；分成 `dlp.example.com` 與 `dlp-api.example.com` 可以避免用 Worker/Pages Function 轉送大型下載檔案。

### 1. 登入 Cloudflare CLI

```bash
wrangler login
cloudflared tunnel login
```

`wrangler` 用來第一次建立 Pages project；之後部署由 GitHub Actions 自動執行。`cloudflared` 用來建立 tunnel、DNS route 與啟動本機 tunnel。

### 2. 建立 Cloudflare Pages project

只需要做一次：

```bash
wrangler pages project create yt-dlp-web-downloader --production-branch main
```

建立後在 Cloudflare Pages project 綁定 custom domain：

```text
dlp.example.com
```

### 3. 設定 GitHub Actions secrets

GitHub Actions workflow 會在 push 到 `main` 時自動部署 Pages。到 GitHub repo：

```text
Settings -> Secrets and variables -> Actions
```

新增 repository secrets：

```text
CLOUDFLARE_ACCOUNT_ID=<Cloudflare account id>
CLOUDFLARE_API_TOKEN=<Cloudflare API token>
```

`CLOUDFLARE_API_TOKEN` 至少需要能部署 Cloudflare Pages。建議建立 scoped token，不要使用全域 API key。

### 4. 自動部署流程

workflow 檔案：

```text
.github/workflows/deploy-cloudflare-pages.yml
```

push 到 `main` 後會自動執行：

```text
pnpm install --frozen-lockfile
pnpm -r test
pnpm -r typecheck
pnpm --filter @yt-dlp-web-downloader/web build
wrangler pages deploy apps/web/dist --project-name=yt-dlp-web-downloader --branch=main
```

workflow 內設定：

```bash
VITE_API_BASE_URL=https://dlp-api.example.com
```

因此 Cloudflare Pages 上的前端會呼叫 tunnel API hostname；本機 `pnpm dev` 仍走 `/api`，不會受到影響。

GitHub Actions 只會部署 Cloudflare Pages 前端，不會啟動或更新本機 API。外網 API 仍由這台機器上的 `pnpm api:tunnel` 提供，所以 `.env.production` 必須留在本機並由本機 process 讀取。

手動觸發也可以到 GitHub Actions 頁面執行 `Deploy Cloudflare Pages` workflow。

### 5. 建立本機 tunnel runtime env

```bash
cp .env.production.example .env.production
```

目前 `.env.production.example`：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
PUBLIC_BASE_URL=https://dlp-api.example.com
ALLOWED_ORIGINS=https://dlp.example.com
DATA_DIR=./data
```

`.env` 保留共用 secret；`.env.production` 放 Cloudflare production URL、CORS、`PORT=8787` 與 production data path。`dotenv-cli` 會保留先讀到的值，所以 production 指令要先讀 `.env.production`，再讀 `.env` 補上 `ADMIN_TOKEN` 等共用 secret。

啟動 production API：

```bash
pnpm build
dotenv -e .env.production -e .env -- pnpm --filter @yt-dlp-web-downloader/server start
```

### 6. 建立 Cloudflare Tunnel

第一次建立 tunnel：

```bash
cloudflared tunnel create yt-dlp-web-downloader
cloudflared tunnel route dns yt-dlp-web-downloader dlp-api.example.com
```

建立後把 `.cloudflared/yt-dlp-web-downloader.example.yml` 複製成 `.cloudflared/yt-dlp-web-downloader.yml`，並把 `credentials-file` 換成 `cloudflared tunnel create` 產生的 credentials JSON 路徑。
此專案的 tunnel config 固定使用 `protocol: http2`，避免部分網路環境下 QUIC/UDP 連線不穩。

啟動 tunnel：

```bash
cloudflared tunnel --config .cloudflared/yt-dlp-web-downloader.yml --loglevel warn --transport-loglevel warn run yt-dlp-web-downloader
```

### 7. 驗證

```bash
curl https://dlp-api.example.com/health
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://dlp-api.example.com/api/system/check
```

瀏覽器驗證：

1. 開 `https://dlp.example.com`
2. 輸入 `.env` 裡的 `ADMIN_TOKEN`
3. 確認系統狀態可用
4. 貼影片 URL 分析
5. 建立下載任務
6. 下載完成檔案

如果瀏覽器 console 出現 CORS error，先確認本機 server 是用 `.env.production` 啟動，且 `ALLOWED_ORIGINS=https://dlp.example.com`。

如果 DevTools 裡 request 沒有任何 response headers，通常不是 CORS allow-list，而是 `dlp-api.example.com` 沒有解析到 Cloudflare Tunnel，或 tunnel process 沒有連上。先確認：

```bash
dig @1.1.1.1 +short dlp-api.example.com A
pnpm api:tunnel
```

`dig` 應該看到 Cloudflare proxy 的 A records；如果 `@1.1.1.1` 有值但瀏覽器仍連不到，通常是本機或瀏覽器 DNS cache 還沒更新。`pnpm api:tunnel` 必須持續執行，外網 API 才會在線。

每次服務收到 request，server terminal 會記錄使用時間：

```text
[usage] 2026-06-30 22:14 service used
```

## 設定

所有設定鍵請參考 `.env.example`。重要預設值：

```text
PORT=8788
PUBLIC_BASE_URL=http://127.0.0.1:8788
ALLOWED_ORIGINS=
DATA_DIR=./data-dev
JOB_CONCURRENCY=1
ANALYZE_TIMEOUT_SECONDS=60
DOWNLOAD_TIMEOUT_SECONDS=7200
FILE_TTL_MINUTES=3
CLEANUP_INTERVAL_MINUTES=60
MIN_FREE_DISK_BYTES=5368709120
RATE_LIMIT_ANALYZE_PER_MINUTE=10
RATE_LIMIT_JOB_CREATE_PER_MINUTE=5
ENABLE_SSE=false
ENABLE_RANGE_REQUESTS=false
YT_DLP_BINARY=yt-dlp
FFMPEG_BINARY=ffmpeg
FFPROBE_BINARY=ffprobe
API_ORIGIN=http://127.0.0.1:8788
VITE_API_BASE_URL=
```

目前 `ENABLE_SSE` 與 `ENABLE_RANGE_REQUESTS` 是預留設定；前端目前使用 polling，下載 route 目前串流完整檔案。

## API 摘要

公開 endpoint：

- `GET /health`
  - 回傳 `{ ok, time }`。
- `GET /api/download/{token}`
  - signed token 有效時串流完成檔案。
  - token/job 過期時回 `410 DOWNLOAD_EXPIRED`。

需要 `Authorization: Bearer <ADMIN_TOKEN>` 保護：

- `GET /api/system/check`
- `POST /api/analyze`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`

### `GET /api/system/check`

檢查：

- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- storage 是否可寫、剩餘容量是否足夠

前端只顯示「系統正常」或「服務不可用」，不顯示依賴名稱與版本；詳細資訊保留給 README 與 server terminal。

### `POST /api/analyze`

Request：

```json
{
  "url": "https://example.com/watch?v=..."
}
```

Response 會包含：

```json
{
  "analysisId": "ana_...",
  "url": "https://example.com/watch?v=...",
  "title": "Video Title",
  "thumbnail": "https://...",
  "durationSeconds": 123,
  "extractor": "Twitter",
  "webpageUrl": "https://...",
  "recommendedOptions": {
    "qualityPreset": "bestAvailable"
  },
  "formatSummary": {
    "hasVideo": true,
    "hasAudio": true,
    "maxHeight": 1080,
    "ext": "mp4",
    "qualityEstimates": []
  }
}
```

### `POST /api/jobs`

可以從 `analysisId` 建立：

```json
{
  "analysisId": "ana_...",
  "options": {
    "qualityPreset": "bestUnder1080p"
  }
}
```

也可以直接從 URL 建立：

```json
{
  "url": "https://example.com/watch?v=...",
  "options": {
    "qualityPreset": "bestAvailable"
  }
}
```

Response：

```json
{
  "jobId": "job_...",
  "status": "queued",
  "statusUrl": "/api/jobs/job_..."
}
```

### `GET /api/jobs/{jobId}`

Response 例：

```json
{
  "jobId": "job_...",
  "id": "job_...",
  "analysisId": "ana_...",
  "url": "https://example.com/watch?v=...",
  "title": "Video Title",
  "extractor": "Twitter",
  "status": "running",
  "progress": {
    "phase": "downloading",
    "percent": 42,
    "downloadedBytes": 42000000,
    "totalBytes": 100000000,
    "speedBytesPerSecond": 2000000,
    "etaSeconds": 65
  },
  "result": null,
  "error": null,
  "createdAt": "2026-06-27T00:00:00.000Z",
  "updatedAt": "2026-06-27T00:00:00.000Z",
  "startedAt": "2026-06-27T00:00:00.000Z",
  "completedAt": null,
  "expiresAt": "2026-06-27T00:03:00.000Z"
}
```

完成後：

```json
{
  "status": "completed",
  "result": {
    "fileName": "video.mp4",
    "size": 19000000,
    "contentType": "video/mp4",
    "downloadUrl": "/api/download/dl_...",
    "expiresAt": "2026-06-27T00:03:00.000Z"
  }
}
```

### 錯誤格式

所有 API 錯誤都使用：

```json
{
  "error": {
    "code": "YTDLP_FAILED",
    "message": "yt-dlp 執行失敗，請稍後再試。",
    "retryable": true
  }
}
```

前端可見錯誤都應該是 normalized message，不應包含：

- stack trace
- 本機檔案路徑
- shell command
- token
- cookie
- 原始 stderr 中的敏感資訊

## Security Model

### Auth

`ADMIN_TOKEN` 是 app-level 保護。除 `/health` 與 `/api/download/{token}` 外，所有 `/api/*` route 都需要 bearer token。

下載 route 不要求 `ADMIN_TOKEN`，因為它使用短效 signed token。這讓使用者可以直接點下載，但 token 很快失效。

### SSRF 防護

URL 會經過安全檢查，避免下載器變成對內網打 request 的代理。

阻擋範圍包含：

- localhost
- loopback
- private IPv4
- link-local
- 不安全 DNS 解析結果

### Command execution

後端不組 shell string，而是使用 argument array 執行：

```ts
spawn(command, args, { shell: false })
```

URL 會放在 `--` 後面，避免被解析成 command option。

### File system

所有結果檔都限制在：

```text
DATA_DIR/jobs/{jobId}
```

server 只會尋找該 job 目錄內的非暫存檔作為 result file。

### Token storage

Download token 明文不進 DB，只存 SHA-256 hash。即使 SQLite 檔案外洩，也不能直接拿到有效下載 URL。

## Cloudflare Tunnel

部署目標與操作流程請看上方「Cloudflare 部署」。目前建議使用 Cloudflare Pages 提供 `dlp.example.com`，Cloudflare Tunnel 提供 `dlp-api.example.com`，並保留 `ADMIN_TOKEN` 作為 app-level 防護。

不要把此服務匿名公開，原因：

- `yt-dlp` 與 `ffmpeg` 都是重型任務。
- 下載內容會短暫落在本機磁碟。
- 公開服務容易被濫用。

## 資料保留

- Analysis record 約 1 小時後過期。
- Download job 與檔案會在 `FILE_TTL_MINUTES` 後過期，預設 3 分鐘。
- Cleanup 每 `CLEANUP_INTERVAL_MINUTES` 執行一次。
- Cleanup 只會刪除 `DATA_DIR/jobs` 底下由 server 產生的 job 目錄。
- Download token 只儲存 SHA-256 hash，不儲存明文 token。

## 目前限制

- 不支援 playlist 或批次下載。
- 不支援瀏覽器 cookie 匯入。
- 不支援 DRM 或付費牆繞過。
- 不支援多使用者帳號。
- 不提供取消或刪除任務的功能；任務只能執行至 completed、failed 或 expired。
- 不提供任務歷史頁面。
- 不支援 SSE；前端使用 polling。
- 尚未支援 HTTP range request。
- ffmpeg 壓縮策略目前是固定 preset，不提供 UI 調整 CRF、codec 或 bitrate。
- 檔案不是長期保存；預設 3 分鐘後下載連結與檔案失效。

## 疑難排解

### UI 顯示系統不可用

先確認：

```bash
yt-dlp --version
ffmpeg -version
ffprobe -version
```

再呼叫：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://127.0.0.1:8787/api/system/check
```

### `YTDLP_FAILED`

server terminal 只會列出 `yt-dlp` 的簡短摘要與 log 路徑，不會把完整 stderr 或 progress JSON 全部印到 terminal。

完整錯誤細節依階段寫到：

- 分析階段：`DATA_DIR/logs/yt-dlp-analyze.log`
- 下載階段：`DATA_DIR/jobs/{jobId}/yt-dlp.log`

常見原因：

- 網站規則變更，需要更新 `yt-dlp`。
- 該 URL 需要登入或權限。
- 網站暫時阻擋。
- URL 不是支援的影片頁。

先試：

```bash
brew upgrade yt-dlp
```

### `FFMPEG_MISSING`

安裝 `ffmpeg`：

```bash
brew install ffmpeg
```

或設定：

```bash
FFMPEG_BINARY=/absolute/path/to/ffmpeg
FFPROBE_BINARY=/absolute/path/to/ffprobe
```

### `INSUFFICIENT_DISK_SPACE`

釋放磁碟空間，或調整：

```bash
MIN_FREE_DISK_BYTES=...
```

不建議把門檻設太低，因為下載與 ffmpeg 壓縮會短暫需要原始檔與 optimized 檔同時存在。

### `UNSAFE_URL`

URL 指向 localhost、private network，或 DNS 解析到不安全 IP。這是預期防護。

### 下載連結過期

預設 3 分鐘後過期。前端會顯示：

```text
下載連結已過期，請重新建立下載任務。
```

重新貼 URL 分析並建立新的下載任務即可。

### dev server 沒有 hot reload

前端走 Vite，通常會 hot reload。後端走 `tsx watch`，一般 TypeScript server 變更也會重啟。

如果畫面或 API 行為沒有更新：

1. 確認你開的是 `http://127.0.0.1:5173`，不是 `8787`。
2. 看 terminal 是否還有 `api` / `web` 兩個 process。
3. 必要時重跑：

```bash
pnpm dev
```

## Manual QA

請參考 `docs/manual-qa.md`。

建議手測項目：

- 沒 token 時 API 被拒絕。
- token 設定後系統狀態可用。
- URL 分析成功。
- 不支援 URL 顯示 sanitized error。
- 建立下載任務後首頁顯示處理狀態。
- `yt-dlp` retry message 能出現在前端。
- 壓縮中 message 能出現在前端。
- 完成後顯示檔案大小、過期時間、處理時間。
- 下載成功。
- 超過 3 分鐘後點下載，前端留在原頁並顯示過期提示。

## 法務與使用邊界

請只用此工具下載你擁有、已取得授權，或來源網站條款允許保存的內容。

本 App 不提供：

- DRM 繞過
- 付費牆繞過
- cookie 匯入
- playlist 下載
- 多使用者公開服務

這個工具的定位是本機 owner-operated workflow：短暫分析、下載、壓縮、提供短效檔案連結，然後自動清理。
