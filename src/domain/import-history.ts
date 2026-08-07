import Papa from 'papaparse'
import { z } from 'zod'
import { isRegularSession } from './market-calendar'
import { MODEL_VERSION } from './model'
import type { HistoryDataset, ImportIssue, ImportResult, PriceBar } from './types'

export type HistoryImportOptions = Omit<HistoryDataset, 'id' | 'sha256' | 'bars'>

export type HistoryCsvSource = {
  filename: string
  csv: string
}

const optionsSchema = z.object({
  symbol: z.string().trim().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  filename: z.string().min(1),
  sourceUrl: z.string().url(),
  importedAt: z.string().datetime(),
  splitAdjustedConfirmed: z.boolean(),
  discontinuitiesConfirmed: z.boolean(),
  interval: z.enum(['daily', 'weekly']),
})

const aliases = {
  date: ['date'],
  close: ['price', 'close', 'last'],
  open: ['open'],
  high: ['high'],
  low: ['low'],
  volume: ['vol.', 'volume', 'vol'],
  change: ['change %', 'change', 'change%'],
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

function vendorRowFingerprint(open: number | undefined, close: number | undefined, volume: number | undefined) {
  if (open === undefined || close === undefined || volume === undefined) return undefined
  return `${open}|${close}|${volume}`
}

function datesWithinDays(left: string, right: string, days: number) {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) <= days * 86_400_000
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type CanonicalCsvRow = {
  Date: string
  Price: string
  Open: string
  High: string
  Low: string
  'Vol.': string
  'Change %': string
}

function canonicalValue(row: Record<string, string>, header: string | undefined) {
  return header ? (row[header] ?? '') : ''
}

function sameMarketRow(left: CanonicalCsvRow, right: CanonicalCsvRow) {
  return parseNumber(left.Price) === parseNumber(right.Price) &&
    parseNumber(left.Open) === parseNumber(right.Open) &&
    parseNumber(left.High) === parseNumber(right.High) &&
    parseNumber(left.Low) === parseNumber(right.Low) &&
    parseNumber(left['Vol.']) === parseNumber(right['Vol.'])
}

function nextRegularSession(date: string) {
  const next = new Date(`${date}T00:00:00Z`)
  do {
    next.setUTCDate(next.getUTCDate() + 1)
  } while (!isRegularSession(next.toISOString().slice(0, 10)))
  return next.toISOString().slice(0, 10)
}

function combinedCsvFilename(sources: HistoryCsvSource[]) {
  return sources.length === 1
    ? sources[0].filename
    : sources.map((source) => source.filename).join(' + ')
}

export async function importHistoryCsvFiles(
  sources: HistoryCsvSource[],
  rawOptions: HistoryImportOptions,
): Promise<ImportResult> {
  if (sources.length === 0) {
    return {
      errors: [{ code: 'NO_FILES', message: 'Select at least one CSV file.' }],
      warnings: [],
    }
  }
  if (sources.length === 1) {
    return importHistoryCsv(sources[0].csv, {
      ...rawOptions,
      filename: sources[0].filename,
    })
  }

  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const rows: CanonicalCsvRow[] = []
  const rowsByDate = new Map<string, { row: CanonicalCsvRow; filename: string }>()
  const sourceRanges: { filename: string; first: string; last: string }[] = []
  let deduplicatedDates = 0

  for (const source of sources) {
    const result = Papa.parse<Record<string, string>>(source.csv, {
      header: true,
      skipEmptyLines: 'greedy',
    })
    errors.push(...result.errors.map((error) => ({
      code: 'CSV_PARSE',
      message: `${source.filename}: ${error.message}`,
      ...(error.row === undefined ? {} : { row: error.row + 2 }),
    })))
    const headers = result.meta.fields ?? []
    const columns = Object.fromEntries(
      Object.entries(aliases).map(([key, names]) => [key, findHeader(headers, names)]),
    )
    for (const required of ['date', 'close', 'open', 'high', 'low'] as const) {
      if (!columns[required]) {
        errors.push({
          code: 'MISSING_COLUMN',
          message: `${source.filename}: missing required ${required} column.`,
        })
      }
    }
    if (errors.length) continue

    const dates: string[] = []
    result.data.forEach((rawRow) => {
      const row: CanonicalCsvRow = {
        Date: canonicalValue(rawRow, columns.date),
        Price: canonicalValue(rawRow, columns.close),
        Open: canonicalValue(rawRow, columns.open),
        High: canonicalValue(rawRow, columns.high),
        Low: canonicalValue(rawRow, columns.low),
        'Vol.': canonicalValue(rawRow, columns.volume),
        'Change %': canonicalValue(rawRow, columns.change),
      }
      const date = parseDate(row.Date)
      if (!date) {
        rows.push(row)
        return
      }
      if (rawOptions.interval === 'weekly' || isRegularSession(date)) dates.push(date)
      const existing = rowsByDate.get(date)
      if (!existing) {
        rowsByDate.set(date, { row, filename: source.filename })
        rows.push(row)
        return
      }
      if (existing.filename === source.filename) {
        rows.push(row)
        return
      }
      if (sameMarketRow(existing.row, row)) {
        deduplicatedDates += 1
        return
      }
      errors.push({
        code: 'CONFLICTING_DATE',
        message: `Conflicting OHLC or volume for ${date} in ${existing.filename} and ${source.filename}.`,
      })
    })
    if (dates.length > 0) {
      dates.sort()
      sourceRanges.push({
        filename: source.filename,
        first: dates[0],
        last: dates.at(-1)!,
      })
    }
  }

  if (errors.length) return { errors, warnings }

  sourceRanges.sort((left, right) => left.first.localeCompare(right.first))
  let coveredRange = sourceRanges[0]
  for (let index = 1; index < sourceRanges.length; index += 1) {
    const current = sourceRanges[index]
    if (current.first <= coveredRange.last) {
      if (current.last > coveredRange.last) coveredRange = current
      continue
    }
    const expected = rawOptions.interval === 'daily'
      ? nextRegularSession(coveredRange.last)
      : undefined
    if (expected && current.first !== expected) {
      warnings.push({
        code: 'FILE_RANGE_GAP',
        message: `Possible missing sessions between ${coveredRange.filename} (${coveredRange.last}) and ${current.filename} (${current.first}); the next expected regular session was ${expected}.`,
      })
    }
    coveredRange = current
  }
  if (deduplicatedDates > 0) {
    warnings.push({
      code: 'DUPLICATE_DATE_DEDUPED',
      message: `Deduplicated ${deduplicatedDates} identical overlapping date row${deduplicatedDates === 1 ? '' : 's'} across the selected files.`,
    })
  }

  const combinedCsv = Papa.unparse(rows, {
    columns: ['Date', 'Price', 'Open', 'High', 'Low', 'Vol.', 'Change %'],
  })
  const result = await importHistoryCsv(combinedCsv, {
    ...rawOptions,
    filename: combinedCsvFilename(sources),
  })
  const mergedWarnings = [...warnings, ...result.warnings]
  if (result.dataset?.quality) result.dataset.quality.warnings = mergedWarnings
  return { ...result, warnings: mergedWarnings }
}

export async function importHistoryCsv(csv: string, rawOptions: HistoryImportOptions): Promise<ImportResult> {
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
  let excludedNonSessionArtifacts = 0
  const reportedChanges = new Map<string, number>()
  const regularRowsByFingerprint = new Map<string, string[]>()
  const regularDatesByClose = new Map<number, string[]>()
  if (parsedOptions.data.interval === 'daily') {
    result.data.forEach((row) => {
      const date = parseDate(row[columns.date!])
      if (!date || !isRegularSession(date)) return
      const close = parseNumber(row[columns.close!])
      if (close !== undefined) {
        regularDatesByClose.set(close, [...(regularDatesByClose.get(close) ?? []), date])
      }
      const fingerprint = vendorRowFingerprint(
        parseNumber(row[columns.open!]),
        close,
        columns.volume ? parseNumber(row[columns.volume]) : undefined,
      )
      if (!fingerprint) return
      regularRowsByFingerprint.set(fingerprint, [...(regularRowsByFingerprint.get(fingerprint) ?? []), date])
    })
  }
  result.data.forEach((row, index) => {
    const line = index + 2
    const date = parseDate(row[columns.date!])
    const open = parseNumber(row[columns.open!])
    const high = parseNumber(row[columns.high!])
    const low = parseNumber(row[columns.low!])
    const close = parseNumber(row[columns.close!])
    const volume = columns.volume ? parseNumber(row[columns.volume]) : undefined
    const reportedChange = columns.change ? parseNumber(row[columns.change]?.replace('%', '')) : undefined
    if (!date || [open, high, low, close].some((value) => value === undefined || value <= 0)) {
      errors.push({ code: 'INVALID_ROW', message: 'Date and OHLC must be valid positive values.', row: line })
      return
    }
    if (parsedOptions.data.interval === 'daily' && !isRegularSession(date)) {
      const fingerprint = vendorRowFingerprint(open, close, volume)
      const duplicatesNearbySession = fingerprint
        ? (regularRowsByFingerprint.get(fingerprint) ?? []).some((sessionDate) => datesWithinDays(date, sessionDate, 4))
        : false
      const duplicatesNearbyClose = (regularDatesByClose.get(close!) ?? [])
        .some((sessionDate) => datesWithinDays(date, sessionDate, 4))
      const isFlatCorporateActionMarker = open === high && high === low && low === close &&
        (volume === undefined || duplicatesNearbyClose)
      const hasExtremeReportedChange = reportedChange !== undefined && Math.abs(reportedChange) >= 100
      if (isFlatCorporateActionMarker || hasExtremeReportedChange || duplicatesNearbySession) {
        excludedNonSessionArtifacts += 1
        return
      }
    }
    if (parsedOptions.data.interval === 'daily' && !isRegularSession(date)) {
      errors.push({ code: 'NON_SESSION_ROW', message: `${date} is not a regular US equity session.`, row: line })
      return
    }
    if (seenDates.has(date)) errors.push({ code: 'DUPLICATE_DATE', message: `Duplicate date ${date}.`, row: line })
    seenDates.add(date)
    if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || low! > high!) {
      errors.push({ code: 'INVALID_OHLC', message: `OHLC invariant failed for ${date}.`, row: line })
    }
    bars.push({ date, open: open!, high: high!, low: low!, close: close!, ...(volume === undefined ? {} : { volume }) })
    if (reportedChange !== undefined) reportedChanges.set(date, reportedChange / 100)
  })
  bars.sort((a, b) => a.date.localeCompare(b.date))
  if (excludedNonSessionArtifacts > 0) warnings.push({ code: 'CORPORATE_ACTION_MARKERS', message: `Excluded ${excludedNonSessionArtifacts} non-session vendor or corporate-action artifact rows from the price history.` })
  let suspectedDiscontinuity = false
  const changeDiscrepancyDates: string[] = []
  for (let index = 1; index < bars.length; index += 1) {
    const ratio = bars[index].close / bars[index - 1].close
    if (ratio < 0.35 || ratio > 2.85) {
      suspectedDiscontinuity = true
      warnings.push({ code: 'SUSPECTED_SPLIT', message: `Large price discontinuity near ${bars[index].date}; confirm a consistent split-adjusted basis.` })
    }
    const reported = reportedChanges.get(bars[index].date)
    const recomputed = ratio - 1
    if (reported !== undefined && Math.abs(reported - recomputed) > 0.005) changeDiscrepancyDates.push(bars[index].date)
  }
  if (changeDiscrepancyDates.length > 0) {
    const first = changeDiscrepancyDates[0]
    const last = changeDiscrepancyDates.at(-1)!
    const dateRange = first === last ? first : `${first} to ${last}`
    warnings.push({ code: 'CHANGE_DISCREPANCY', message: `Reported Change % differs from OHLC-recomputed close returns for ${changeDiscrepancyDates.length} sessions (${dateRange}); OHLC-derived returns remain authoritative.` })
  }
  if (!bars.length) errors.push({ code: 'NO_DATA', message: 'The file contains no accepted price rows.' })
  if (suspectedDiscontinuity && !parsedOptions.data.discontinuitiesConfirmed) errors.push({ code: 'SUSPECTED_SPLIT_CONFIRMATION_REQUIRED', message: 'Review and explicitly confirm the detected price discontinuity before import.' })
  if (bars.length < 100) warnings.push({
    code: 'SMALL_SAMPLE',
    message: `Fewer than 100 ${parsedOptions.data.interval} observations; decision grades may be unavailable.`,
  })
  if (errors.length) return { errors, warnings }

  const hash = await sha256(csv)
  const dataset: HistoryDataset = { ...parsedOptions.data, id: `${parsedOptions.data.symbol}-${hash.slice(0, 12)}`, sha256: hash, modelVersion: MODEL_VERSION, quality: { acceptedRows: bars.length, rejectedRows: excludedNonSessionArtifacts, warnings }, bars }
  return { dataset, errors, warnings }
}
