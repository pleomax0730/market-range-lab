import { addDays, format, getDay, parseISO, startOfWeek } from 'date-fns'

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7))
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return new Date(Date.UTC(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)))
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}

function observedFixedHoliday(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day))
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1)
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function marketHolidays(year: number) {
  const easter = easterSunday(year)
  const goodFriday = new Date(easter)
  goodFriday.setUTCDate(easter.getUTCDate() - 2)
  const holidays = [
    observedFixedHoliday(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday,
    lastWeekday(year, 4, 1),
    ...(year >= 2022 ? [observedFixedHoliday(year, 5, 19)] : []),
    observedFixedHoliday(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
  ]
  return new Set(holidays.map(iso))
}

export function isRegularSession(date: string) {
  const value = parseISO(date)
  const day = getDay(value)
  return day !== 0 && day !== 6 && !marketHolidays(value.getFullYear()).has(date)
}

export function targetWeekClose(anchorDate: string, weeks: number, rollPastCurrentWeek = false) {
  const anchor = parseISO(anchorDate)
  const monday = startOfWeek(anchor, { weekStartsOn: 1 })
  const candidateFriday = addDays(monday, 4 + (weeks - 1 + (rollPastCurrentWeek ? 1 : 0)) * 7)
  let candidate = candidateFriday
  while (!isRegularSession(format(candidate, 'yyyy-MM-dd'))) candidate = addDays(candidate, -1)
  return format(candidate, 'yyyy-MM-dd')
}

export function isFinalRegularSessionOfWeek(date: string) {
  return targetWeekClose(date, 1) === date
}

export function previousRegularSession(anchorDate: string) {
  let candidate = addDays(parseISO(anchorDate), -1)
  while (!isRegularSession(format(candidate, 'yyyy-MM-dd'))) candidate = addDays(candidate, -1)
  return format(candidate, 'yyyy-MM-dd')
}
