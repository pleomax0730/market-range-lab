import Papa from 'papaparse'
import { z } from 'zod'
import { isRegularSession } from './market-calendar'
import type { HistoryDataset, ImportIssue, ImportResult, PriceBar } from './types'

type ImportOptions = Omit<HistoryDataset, 'id' | 'sha256' | 'bars'>

const optionsSchema = z.object({
  symbol: z.string().trim().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  filename: z.string().min(1),
  sourceUrl: z.string().url(),
  importedAt: z.string().datetime(),
  splitAdjustedConfirmed: z.boolean(),
})

const aliases = {
  date: ['date'],
  close: ['price', 'close', 'last'],
  open: ['open'],
  high: ['high'],
  low: ['low'],
  volume: ['vol.', 'volume', 'vol'],
} as const

function normalized(value: string) {
  return value.trim().toLowerCase()
}

function findHeader(headers: string[], names: readonly string[]) {
  return headers.find((header) => names.includes(normalized(header)))
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const raw = String(value).trim().replaceAll(',', '')
  if (!raw || raw === '-') return undefined
  const suffix = raw.at(-1)?.toUpperCase()
  const multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1
  const numeric = Number(multiplier === 1 ? raw : raw.slice(0, -1))
  return Number.isFinite(numeric) ? numeric * multiplier : undefined
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  let year: number
  let month: number
  let day: number
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) [year, month, day] = raw.split('-').map(Number)
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) [month, day, year] = raw.split('/').map(Number)
  else return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function importHistoryCsv(csv: string, rawOptions: ImportOptions): Promise<ImportResult> {
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const parsedOptions = optionsSchema.safeParse(rawOptions)
  if (!parsedOptions.success) return { errors: [{ code: 'INVALID_METADATA', message: parsedOptions.error.issues[0].message }], warnings }
  if (!parsedOptions.data.splitAdjustedConfirmed) return { errors: [{ code: 'SPLIT_CONFIRMATION_REQUIRED', message: 'Confirm that all OHLC columns use the same split-adjusted basis before import.' }], warnings }

  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: 'greedy' })
  if (result.errors.length) errors.push(...result.errors.map((error) => ({ code: 'CSV_PARSE', message: error.message, ...(error.row === undefined ? {} : { row: error.row + 2 }) })))
  const headers = result.meta.fields ?? []
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, findHeader(headers, names)]))
  for (const required of ['date', 'close', 'open', 'high', 'low'] as const) {
    if (!columns[required]) errors.push({ code: 'MISSING_COLUMN', message: `Missing required ${required} column.` })
  }
  if (errors.length) return { errors, warnings }

  const bars: PriceBar[] = []
  const seenDates = new Set<string>()
  let corporateActionMarkers = 0
  result.data.forEach((row, index) => {
    const line = index + 2
    const date = parseDate(row[columns.date!])
    const open = parseNumber(row[columns.open!])
    const high = parseNumber(row[columns.high!])
    const low = parseNumber(row[columns.low!])
    const close = parseNumber(row[columns.close!])
    const volume = columns.volume ? parseNumber(row[columns.volume]) : undefined
    if (!date || [open, high, low, close].some((value) => value === undefined || value <= 0)) {
      errors.push({ code: 'INVALID_ROW', message: 'Date and OHLC must be valid positive values.', row: line })
      return
    }
    if (!isRegularSession(date) && volume === undefined && open === high && high === low && low === close) {
      corporateActionMarkers += 1
      return
    }
    if (seenDates.has(date)) errors.push({ code: 'DUPLICATE_DATE', message: `Duplicate date ${date}.`, row: line })
    seenDates.add(date)
    if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || low! > high!) {
      errors.push({ code: 'INVALID_OHLC', message: `OHLC invariant failed for ${date}.`, row: line })
    }
    bars.push({ date, open: open!, high: high!, low: low!, close: close!, ...(volume === undefined ? {} : { volume }) })
  })
  bars.sort((a, b) => a.date.localeCompare(b.date))
  if (corporateActionMarkers > 0) warnings.push({ code: 'CORPORATE_ACTION_MARKERS', message: `Excluded ${corporateActionMarkers} non-session corporate-action marker rows from the price history.` })
  for (let index = 1; index < bars.length; index += 1) {
    const ratio = bars[index].close / bars[index - 1].close
    if (ratio < 0.35 || ratio > 2.85) warnings.push({ code: 'SUSPECTED_SPLIT', message: `Large price discontinuity near ${bars[index].date}; confirm a consistent split-adjusted basis.` })
  }
  if (bars.length < 100) warnings.push({ code: 'SMALL_SAMPLE', message: 'Fewer than 100 daily observations; decision grades may be unavailable.' })
  if (errors.length) return { errors, warnings }

  const hash = await sha256(csv)
  const dataset: HistoryDataset = { ...parsedOptions.data, id: `${parsedOptions.data.symbol}-${hash.slice(0, 12)}`, sha256: hash, bars }
  return { dataset, errors, warnings }
}
