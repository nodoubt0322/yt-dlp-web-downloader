export function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="masthead">
          <p className="eyebrow">Local Video Link Downloader</p>
          <h1>yt-dlp 影片下載器</h1>
        </header>

        <form className="url-form">
          <label htmlFor="video-url">影片 URL</label>
          <div className="input-row">
            <input id="video-url" name="url" type="url" placeholder="https://example.com/watch?v=..." />
            <button type="submit">分析</button>
          </div>
          <p className="policy-copy">請只下載你擁有權利或已取得授權的內容；本工具不支援 DRM 或付費牆繞過。</p>
        </form>
      </section>
    </main>
  );
}

