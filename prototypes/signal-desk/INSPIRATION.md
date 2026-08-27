# Inspiration ledger

這份原型沒有直接複製第三方元件原始碼；它把公開元件的互動觀念重新實作成 Market Range Lab 自己的模組。這樣能比較設計方向，也不會讓正式產品被五套不一致的 token 綁住。

| 來源 | 吸收的觀念 | 原型中的模組 |
| --- | --- | --- |
| Beautiful UI | 任務列、推薦卡、狀態敘事的節奏 | EvidencePanel、InsightDrawer |
| beUI | 可變形選擇器、展開工具列、檔案匯入 | SymbolSelect、ExpiryPicker、DataDock |
| Rare UI | 步驟播放器、側欄與內容區的空間切換 | RecoveryModule、Night Ledger |
| Transitions.dev | 數字狀態交換、drawer reveal、選擇游標移動 | MetricRail、InsightDrawer、variant switcher |
| shadcn/ui | 原始碼所有權、可組合 primitive、清楚的 accessibility contract | 所有表單、tabs、drawer 與狀態元件 |

## 原型方向

1. **Signal Desk**：推薦。最快完成「選標的 → 選到期 → 比較價位 → 查證據」。
2. **Range Canvas**：把價格距離畫成主要內容，最適合教學與長時間比較。
3. **Night Ledger**：用逐條核對的帳本結構，適合專注研究與夜間使用。

## 不納入

- 第三方商業元件或付費範例的直接拷貝
- 只為了展示動畫、卻沒有決策用途的效果
- 把每個來源的色彩、圓角與陰影一起混用
