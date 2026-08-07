import {
  inferSymbolFromFilename,
  isValidSymbol,
  normalizeSymbol,
} from '../lib/symbol-inference'
import type { HistoryImportOptions } from './import-history'
import type { HistoryCsvSource } from './import-history'
import { reconcileWeekly } from './reconcile-weekly'
import type { HistoryDataset, ImportResult } from './types'

/** Default provenance for manual Investing.com OHLC exports (UI no longer hardcodes this). */
export const DEFAULT_HISTORY_SOURCE_URL =
  'https://www.investing.com/etfs/direxion-dly-semiconductor-bull-3x-historical-data'

export type HistoryInterval = 'daily' | 'weekly'

export type PendingHistoryImport = {
  filename: string
  csv: string
  interval: HistoryInterval
  detectedSymbol: string
  symbol: string
}

export type HistoryImportPreparation =
  | { status: 'ready'; filename: string; csv: string; interval: HistoryInterval; symbol: string }
  | { status: 'needs-confirmation'; pending: PendingHistoryImport }
  | { status: 'error'; messages: string[] }

export type PendingHistoryFilesImport = {
  filename: string
  sources: HistoryCsvSource[]
  interval: HistoryInterval
  detectedSymbol: string
  symbol: string
}

export type HistoryFilesImportPreparation =
  | {
      status: 'ready'
      filename: string
      sources: HistoryCsvSource[]
      interval: HistoryInterval
      symbol: string
    }
  | { status: 'needs-confirmation'; pending: PendingHistoryFilesImport }
  | { status: 'error'; messages: string[] }

export function defaultHistoryImportOptions(
  partial: Pick<HistoryImportOptions, 'symbol' | 'filename' | 'interval'> & {
    importedAt?: string
  },
): HistoryImportOptions {
  return {
    symbol: normalizeSymbol(partial.symbol),
    filename: partial.filename,
    sourceUrl: DEFAULT_HISTORY_SOURCE_URL,
    importedAt: partial.importedAt ?? new Date().toISOString(),
    splitAdjustedConfirmed: true,
    discontinuitiesConfirmed: true,
    interval: partial.interval,
  }
}

export async function prepareHistoryImport(
  file: Pick<File, 'name' | 'text'>,
  interval: HistoryInterval,
): Promise<HistoryImportPreparation> {
  const inference = inferSymbolFromFilename(file.name)
  if (!inference.symbol) {
    return {
      status: 'error',
      messages: [
        '錯誤：無法從檔名辨識 Symbol，請使用包含 ticker 的檔名，例如 SOXL ETF History.csv。',
      ],
    }
  }
  const csv = await file.text()
  if (inference.requiresConfirmation) {
    return {
      status: 'needs-confirmation',
      pending: {
        filename: file.name,
        csv,
        interval,
        detectedSymbol: inference.detectedToken ?? inference.symbol,
        symbol: inference.symbol,
      },
    }
  }
  return {
    status: 'ready',
    filename: file.name,
    csv,
    interval,
    symbol: inference.symbol,
  }
}

export async function prepareHistoryImports(
  files: readonly Pick<File, 'name' | 'text'>[],
  interval: HistoryInterval,
): Promise<HistoryFilesImportPreparation> {
  if (files.length === 0) {
    return { status: 'error', messages: ['錯誤：請至少選擇一個 CSV 檔案。'] }
  }

  const inferred = files.map((file) => ({
    file,
    inference: inferSymbolFromFilename(file.name),
  }))
  const unresolved = inferred.find(({ inference }) => !inference.symbol)
  if (unresolved) {
    return {
      status: 'error',
      messages: [
        `錯誤：無法從「${unresolved.file.name}」辨識 Symbol，請使用包含 ticker 的檔名，例如 SOXL ETF History.csv。`,
      ],
    }
  }

  const symbols = [...new Set(inferred.map(({ inference }) => inference.symbol!))]
  if (symbols.length !== 1) {
    return {
      status: 'error',
      messages: [
        `錯誤：所選檔案辨識到不同 Symbol（${symbols.join('、')}），請一次只匯入同一標的。`,
      ],
    }
  }

  const sources = await Promise.all(files.map(async (file) => ({
    filename: file.name,
    csv: await file.text(),
  })))
  const filename = sources.length === 1
    ? sources[0].filename
    : sources.map((source) => source.filename).join(' + ')
  const detectedSymbols = [...new Set(inferred.map(
    ({ inference }) => inference.detectedToken ?? inference.symbol!,
  ))]
  const common = {
    filename,
    sources,
    interval,
    symbol: symbols[0],
  }
  if (inferred.some(({ inference }) => inference.requiresConfirmation)) {
    return {
      status: 'needs-confirmation',
      pending: {
        ...common,
        detectedSymbol: detectedSymbols.join('、'),
      },
    }
  }
  return { status: 'ready', ...common }
}

export function resolveImportSymbol(symbolInput: string):
  | { ok: true; symbol: string }
  | { ok: false; messages: string[] } {
  const symbol = normalizeSymbol(symbolInput)
  if (!isValidSymbol(symbol)) {
    return {
      ok: false,
      messages: [
        '錯誤：Symbol 需是 Yahoo ticker，例如 PLTR；不可包含空白或公司全名。',
      ],
    }
  }
  return { ok: true, symbol }
}

export function formatHistoryImportMessages(
  result: ImportResult,
  interval: HistoryInterval,
  datasets: HistoryDataset[],
): string[] {
  const messages = [
    ...result.errors.map((item) => `錯誤：${item.message}`),
    ...result.warnings.map((item) => `提醒：${item.message}`),
  ]
  if (!result.dataset) return messages

  if (interval === 'weekly') {
    const matchingDaily = datasets.find(
      (dataset) =>
        dataset.symbol === result.dataset!.symbol &&
        dataset.interval === 'daily' &&
        dataset.id !== result.dataset!.id,
    )
    if (matchingDaily) {
      const reconciliation = reconcileWeekly(
        matchingDaily.bars,
        result.dataset.bars,
      )
      messages.push(
        `Weekly 對帳：${reconciliation.comparisons.length} 個可比較週收盤，${reconciliation.mismatchCount} 個差異超過 0.5%。Weekly 已儲存，Daily 維持 Active。`,
      )
    } else {
      messages.push(
        '已啟用 Weekly-only 分析：使用每週 OHLC 計算週收盤與週內觸及，精度低於 Daily。',
      )
    }
  }
  return messages
}
