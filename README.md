# Market Range Lab

本機儀表板：匯入美股／ETF 的 split-adjusted OHLC 歷史，搭配常規盤（regular session）報價，估計未來 1–8 個交易週收盤的上下檔價格區間，並回報到期收盤跌破／觸及機率與不確定性。

**這不是下單工具，也不提供部位大小或投資建議。**

## 功能摘要

- 匯入 **Daily**（優先）或 **Weekly-only** CSV 作為 Canonical Price History
- 從檔名推斷 Symbol；必要時可確認 Yahoo ticker（例如 `PALANTIR` → `PLTR`）
- 本機 Express／Vite 代理 Yahoo 常規盤報價；可手動覆寫 Reference Price
- 全歷史等權路徑 + 週內位置配對（Daily）或連續週線路徑（Weekly）
- 波動調整的較不利包絡、區塊 bootstrap 95% 區間、單側 95% 風險上限分級
- 下檔 Put 候選價的歷史 Premium 補償參考（非理論定價、非即時選擇權報價）
- 結果可匯出 JSON／CSV；歷史資料留在瀏覽器 IndexedDB

## 技術堆疊

| 層級 | 技術 |
| --- | --- |
| UI | React、TypeScript、Vite、Tailwind、shadcn/ui |
| 分析 | 領域邏輯於 `src/domain`，Web Worker 於 `src/workers` |
| 報價 | `server/quote.mjs`（Yahoo Finance chart API） |
| 儲存 | IndexedDB（`idb`） |
| 測試 | Vitest、Testing Library |

模型版本：`1.3.0`（見 `src/domain/model.ts`）

## 環境需求

- Node.js（建議 LTS）
- npm

## 快速開始

```bash
npm install
npm run dev
```

開發伺服器綁定 `127.0.0.1`，並掛上 `/api/quote`。瀏覽器開啟終端機顯示的本機網址即可。

### 正式建置與本機服務

```bash
npm run build
npm start
```

`npm start` 會以 Express 提供 `dist/`，預設：

```text
http://127.0.0.1:4173
```

可用環境變數 `PORT` 變更埠號。

### 常用指令

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 開發模式（含報價 API middleware） |
| `npm run build` | TypeScript 專案建置 + Vite build |
| `npm start` | 服務建置後的靜態站與報價 API |
| `npm test` | 執行測試一次 |
| `npm run test:watch` | 測試監看模式 |
| `npm run typecheck` | 型別檢查 |
| `npm run lint` | ESLint（零警告） |

## 使用流程

1. **準備 CSV**  
   手動從資料商下載 split-adjusted 日線或週線（例如 Investing.com 的 OHLC 匯出）。應用程式**不會**自動登入或爬取歷史頁面。
2. **匯入**  
   左側選「Daily CSV」或「Weekly CSV」。檔名需含 ticker，例如 `SOXL ETF Stock Price History Daily.csv`。
3. **檢視品質**  
   重複日期、無效 OHLC、疑似拆股不連續等會以錯誤或警告顯示。Daily 需涵蓋至參考日前一正常交易日才可分級；過舊歷史仍可算區間但暫停 Safety Grade。
4. **報價**  
   以 Active Symbol 向 Yahoo 查常規盤價；盤中約每 30 秒更新。開盤中報價超過約 2 分鐘視為 stale，自動分級會暫停，可改手動 Reference Price。
5. **閱讀區間**  
   一次計算未來 1–8 個 Target Week Close。1–4 週為 Decision-Grade；5–8 週為 Scenario，僅情境、不分級。
6. **自訂候選價**  
   輸入任意連續價格，選下檔／Put 或上檔／Call，檢視跌破、路徑觸及與（Put）Premium 參考。
7. **匯出**  
   右上角匯出 JSON 或 CSV（含來源、hash、門檻、區間與警告）。

## CSV 格式

建議欄位（Investing.com 匯出可直接對應）：

| 欄位 | 說明 |
| --- | --- |
| `Date` | `YYYY-MM-DD` 或 `M/D/YYYY` |
| `Price` 或 `Close` | 收盤（`Price` 視為 Close） |
| `Open` / `High` / `Low` | 必填，且需滿足 OHLC 不變量 |
| `Vol.` / `Volume` | 選填；支援 `K`/`M`/`B` |
| `Change %` | 選填；僅作與 OHLC 重算報酬的核對 |

- 日線列應為美國股市正常交易日；非交易日且像公司行動標記的列會被排除並警告。
- 全檔 OHLC 應為同一 split-adjusted 基準。
- 應用程式**不會**用 Yahoo 補齊或覆寫歷史列。

## 資料與隱私

| 資料 | 行為 |
| --- | --- |
| 歷史 CSV | 僅本機 IndexedDB；顯示檔名、SHA-256、日期範圍、匯入時間 |
| 報價 | 僅將 **Symbol** 送至本機伺服器再轉 Yahoo |
| 清除 | 可刪除單一資料集或清空本機全部 |

歷史來源與即時報價來源在 UI 與匯出中分開標示。詳見 [docs/data-sources.md](./docs/data-sources.md)。

## 分析概念（精簡）

完整詞彙見 [CONTEXT.md](./CONTEXT.md)，產品規格見 [docs/product-spec.md](./docs/product-spec.md)。

- **Full-History Baseline**：有效歷史全用，路徑等權，不做 recency 加權。
- **Week-Position-Matched Path（Daily）**：起點 weekday 與目前分析對齊，終點對應 Target Week Close。
- **Contiguous Weekly Path（Weekly-only）**：連續週線 bar；不可還原日內先後。
- **Volatility-Adjusted Path**：以當前已實現波動相對路徑起點波動縮放 log 報酬（約 0.5×–2×），分級取原路徑與調整後較不利者。
- **Safety Grade**（1–4 週且有效路徑足夠）：以單側 95% 風險上限，非點估計。

| 內部等級 | UI 標籤 | 到期跌破上限 | 路徑觸及上限 |
| --- | --- | ---: | ---: |
| Conservative | 符合保守門檻 | ≤ 0.5% | ≤ 1% |
| Safe | 符合安全門檻 | ≤ 2% | ≤ 5% |
| Dangerous | 超出安全門檻 | 任一超過 Safe | 任一超過 Safe |

有效獨立路徑少於約 100、Scenario 週期、歷史過舊、報價 stale／缺失、或 Weekly 盤中預覽時，可能顯示結果但**不給分級**。

**Conservative Model Estimate** 與 **95% Certified Boundary** 分開顯示；EVT 僅作尾部壓力、不單獨認證分級。

### Put Premium 參考（僅下檔）

在歷史路徑上計算到期 payoff 損失後，提供四個每股參考（預設交易成本 $0.03、年化資金門檻 10% 可調）：

1. Statistical Compensation Floor  
2. Capital Return Floor  
3. Light Tail Floor（+10% × (CVaR95 − mean)）  
4. Conservative Tail Floor（+25% × (CVaR95 − mean)）

可手動輸入可成交 net premium 做相對位置比較；**不會**改寫 Safety Grade，也**不是**「便宜可賣」的證明。上檔／Naked Call 不計算 Premium 下限（損失理論無上界）。

## 專案結構

```text
.
├── CONTEXT.md              # 領域詞彙（ubiquitous language）
├── docs/
│   ├── product-spec.md     # 產品規格
│   ├── data-sources.md     # 資料來源
│   └── adr/                # 架構決策
├── server/
│   └── quote.mjs           # Yahoo 報價正規化與快取
├── server.mjs              # 建置後靜態站 + API
├── src/
│   ├── App.tsx             # 儀表板主介面
│   ├── components/         # UI 與分析面板
│   ├── data/datasets.ts    # IndexedDB
│   ├── domain/             # 匯入、日曆、統計、報告、Premium
│   ├── hooks/              # 資料集、報價、分析報告
│   └── workers/            # 分析 Worker
└── package.json
```

## 不在範圍（刻意不做）

- 選擇權鏈、IV、Greeks、理論選擇權定價  
- 下單、券商整合、保證金／指派預算部位建議  
- 加密貨幣、期貨、非美股上市、選擇權合約當歷史  
- 公開雲端部署與自動抓取歷史 CSV  

## 免責

輸出為歷史統計邊界與不確定性描述，**不是**保證、**不是**安全履約價建議，也**不是**投資建議。使用前請自行驗證資料品質與模型假設。

## 進一步文件

- [CONTEXT.md](./CONTEXT.md) — 領域術語  
- [docs/product-spec.md](./docs/product-spec.md) — 行為與介面規格  
- [docs/data-sources.md](./docs/data-sources.md) — 歷史與報價來源  
- [docs/adr/](./docs/adr/) — 決策紀錄（日曆、分級、Weekly-only、Premium 等）  
