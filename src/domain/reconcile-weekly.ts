import { addDays, format, getDay, parseISO, startOfWeek } from 'date-fns'
import type { PriceBar } from './types'

function dailyWeekKey(date: string) {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

function vendorWeekKey(date: string) {
  const value = parseISO(date)
  return getDay(value) === 0 ? format(addDays(value, 1), 'yyyy-MM-dd') : dailyWeekKey(date)
}

export function reconcileWeekly(daily: PriceBar[], weekly: PriceBar[], tolerance = 0.005) {
  const dailyCloses = new Map<string, number>()
  daily.forEach((bar) => dailyCloses.set(dailyWeekKey(bar.date), bar.close))
  const comparisons = weekly.flatMap((bar) => {
    const dailyClose = dailyCloses.get(vendorWeekKey(bar.date))
    return dailyClose === undefined ? [] : [{ week: vendorWeekKey(bar.date), dailyClose, weeklyClose: bar.close, difference: dailyClose / bar.close - 1 }]
  })
  return { comparisons, mismatchCount: comparisons.filter((item) => Math.abs(item.difference) > tolerance).length }
}

