# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

以美股與槓桿 ETF 歷史資料評估 Sell Put 價格區間的個人投資者。使用者通常不是統計專家，需要在短時間內理解到期風險、期間觸及、履約後回復與資料可信度。

## Product Purpose

Market Range Lab 將使用者匯入的 Daily／Weekly OHLC 歷史，轉換成可比較的保守、安全與激進候選價，並解釋歷史事件、模型限制與履約後回復情境。成功不是替使用者下單，而是讓決策依據可讀、可追溯、可質疑。

## Positioning

它不是選擇權理論定價器，而是一個以標的完整歷史路徑、實際剩餘交易日與樣本外驗證為核心的價格區間實驗室。

## Operating Context

使用者在桌面瀏覽器匯入 CSV，搭配目前標的價格與實際到期日檢視模型。常見流程為：選資料集 → 確認價格與時間基準 → 比較三個風險層級 → 檢查事件數與信賴區間 → 自訂履約價 → 檢視履約後回復。

## Capabilities and Constraints

- 原型只演示資訊架構、元件與互動，不連接即時報價、CSV 解析或正式統計引擎。
- 所有數據標示為示意，不可視為投資建議或真實交易訊號。
- 正式產品不使用 option chain、IV、Greeks 或券商報價來認證分級。
- 新概念站必須與既有 `market-range-lab` 專案完全分離。

## Brand Commitments

保留名稱 Market Range Lab。語氣直接、克制、願意揭露不確定性；避免把「安全」表達成保證。

## Evidence on Hand

既有產品規格與介面位於 `C:/Users/VincentWu吳文宏/dev/market-range-lab`，僅供產品語意參考。新原型採用合成示意數據，沒有真實績效聲明。

## Product Principles

1. 先回答「現在可以做什麼判斷」，再展示統計細節。
2. 價格、時間與證據強度必須同時出現在決策附近。
3. 風險層級是比較語言，不是保證語言。
4. 複雜度以漸進揭露處理，不用滿頁控制項壓迫使用者。
5. 每個漂亮元件都必須承擔真實任務。

## Accessibility & Inclusion

鍵盤可操作、清楚 focus、支援 reduced motion、顏色之外另有文字與形狀提示；專有名詞提供白話說明。
