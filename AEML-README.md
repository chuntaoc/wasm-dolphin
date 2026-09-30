# AEML Wii 模擬核心（GitHub Pages）設定說明

(c) AEML, NTUST — 本資料夾是加在 wasm-dolphin 分支（fork）上的外掛檔案，讓 Blogger 上的
「Wii 網頁模擬器」可以內嵌並控制模擬核心。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 已修改的 wasm-dolphin 首頁（多了兩行 `<script>`，其餘不變） |
| `aeml-coi.js` | 第一次開啟時註冊 service worker，並自動重新整理一次 |
| `aeml-sw.js` | 補上 GitHub Pages 無法送出的隔離標頭（COOP/COEP、Document-Isolation-Policy） |
| `aeml-bridge.js` | 與 Blogger 頁面溝通：選檔、按鍵、存檔/讀檔 |
| `.nojekyll` | 讓 GitHub Pages 原樣提供所有檔案 |

## 步驟一：建立分支（fork）

1. 登入 GitHub，開啟 https://github.com/dougchansan/wasm-dolphin
2. 按右上角 **Fork** → **Create fork**（名稱保持 `wasm-dolphin`）。

## 步驟二：上傳外掛檔案

1. 在你的 fork 頁面按 **Add file → Upload files**。
2. 把本資料夾內 **全部檔案**（含 `index.html`，會覆蓋原檔）拖進去。
   `.nojekyll` 是隱藏檔，若看不到：Windows 檔案總管「檢視 → 隱藏的項目」；macOS 按 `Cmd+Shift+.`。
   也可以在 GitHub 上 **Add file → Create new file**，檔名輸入 `.nojekyll`，內容留空。
3. 按 **Commit changes**。

## 步驟三：開啟 GitHub Pages

1. fork 頁面 → **Settings → Pages**。
2. Source 選 **Deploy from a branch**，Branch 選 **main**、資料夾 **/(root)** → **Save**。
3. 等 1–3 分鐘，網址會是：`https://你的帳號.github.io/wasm-dolphin/`
4. 用桌機 Chrome 直接開這個網址測試：頁面會自動重新整理一次，之後拖入遊戲光碟即可執行。

## 步驟四：接到 Blogger

在 Blogger 文章的 HTML 中找到這行，填入你的網址（**不需要**重新簽章）：

```html
<div id="aeml-wii" data-owner="AEML, NTUST" data-build="AEML-NTUST-WII-1.1" data-core="https://你的帳號.github.io/wasm-dolphin/">
```

## 步驟五（建議）：限定只有你的部落格能使用

編輯 `aeml-bridge.js` 最上方的 `ALLOWED_PARENTS`，把
`/^https:\/\/[a-z0-9-]+\.blogspot\.com$/` 改成你的部落格，例如：

```js
/^https:\/\/aeml-ntust\.blogspot\.com$/
```

使用自訂網域的部落格，也要把該網域加進來，否則核心不會回應。

## 使用方式與限制

- **執行環境：桌機版 Chrome / Edge 137 以上。** 內嵌執行靠 Document-Isolation-Policy，
  目前只有桌機 Chromium 支援；手機與 Safari/Firefox 會顯示「無法內嵌執行」。
  手機請用 Blogger 頁面的「藍牙／手機連結」當搖桿，遊戲畫面在電腦上跑。
- **選檔要在遊戲畫面裡點。** 按 Blogger 的「開啟遊戲」後，遊戲畫面會出現
  「選擇遊戲檔案」按鈕，請點那顆（或把檔案直接拖到遊戲畫面上）。
  從外框拖入的檔案，1 GB 以下會自動複製進核心，更大的請用按鈕選。
- **Wii 遙控器輸入：** 這個核心目前只接受 GameCube 手把輸入，尚未支援 Wii 遙控器。
  Blogger 的按鍵會換算成 GameCube 手把：A→A、B→B、1→X、2→Y、+→START、−→Z、
  雙節棍 C→L、Z→R、揮動→R、十字鍵→十字鍵、類比搖桿→主搖桿。
  GameCube 遊戲與接受 GameCube 手把的 Wii 遊戲可以操作；只認 Wii 遙控器的遊戲開得起來但無法操作。
- **存檔：** 進度檔只能在同一版核心讀回；更新 wasm-dolphin 後，舊進度可能被拒絕。
- **授權：** wasm-dolphin 與 Dolphin 為 GPLv2+。你的 fork 是公開原始碼，符合授權要求；
  本資料夾的檔案同樣以 GPL-2.0-or-later 釋出。Blogger 頁面是獨立程式，只透過訊息溝通，
  其防改簽章不受影響。

## 更新 wasm-dolphin

在 fork 頁面按 **Sync fork → Update branch**。若 `index.html` 發生衝突，
重新在 `<meta charset="utf-8">` 後加入：

```html
<script src="./aeml-coi.js"></script>
```

並在 `<script type="module" src="./src/bootstrap.js"></script>` 後加入：

```html
<script type="module" src="./aeml-bridge.js"></script>
```
