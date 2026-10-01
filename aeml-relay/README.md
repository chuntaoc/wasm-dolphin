# AEML Wii 雲端中繼（Cloudflare）

(c) AEML, NTUST — 讓手機搖桿在任何網路下都能連到 Blogger 上的 Wii 模擬器。
電腦頁面與手機各自連到這個 Worker，由它轉送按鍵與體感資料（台灣有 Cloudflare 節點，延遲低）。

## 一次性設定（約 10 分鐘，免費）

1. 先把本資料夾 `aeml-relay/` 上傳到你的 GitHub `wasm-dolphin`（與其他檔案同一包）。
2. 開啟這個網址（把帳號換成你的；若已是 chuntaoc 可直接用）：
   https://deploy.workers.cloudflare.com/?url=https://github.com/chuntaoc/wasm-dolphin/tree/main/aeml-relay
3. 依畫面：註冊／登入 Cloudflare → 授權 GitHub → 按 **Deploy**（名稱保持 `aeml-wii-relay`）。
4. 完成後會得到網址，例如 `https://aeml-wii-relay.你的帳號.workers.dev`。
   用瀏覽器打開它，應顯示 `AEML Wii relay OK (AEML, NTUST)`。
5. 在 Blogger 文章 HTML 的開頭那行填入：
   `data-relay="https://aeml-wii-relay.你的帳號.workers.dev"`
6. 發佈文章，電腦 Ctrl+F5，勾選「藍牙／手機連結」，應看到「雲端中繼（Cloudflare）：已連線 ✓」。

## 允許的網站

`wrangler.jsonc` 的 `ALLOWED_ORIGINS` 列出可以使用這個中繼的網站
（目前：`*.concrete.tw`、`chuntaoc.github.io`、`*.blogspot.com`、`www.blogger.com`）。
其他網站無法借用你的中繼。要增加網站，改這一行後重新部署（Cloudflare 會自動從 GitHub 更新）。

## 費用

Cloudflare Workers 免費方案：每天 10 萬次請求；WebSocket 訊息以 20 則算 1 次。
手機每秒最多送 30 則，約可連續玩 18 小時／天，個人使用不會超過；超過時當天中繼會暫停，隔天（台灣時間 08:00）恢復。
