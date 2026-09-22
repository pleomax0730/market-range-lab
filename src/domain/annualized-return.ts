import { addDays, addYears, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { isRegularSession } from './market-calendar';

export type QuickHorizonOption = '7d' | '30d' | '90d' | '180d' | '1y' | '2y' | 'custom';

export const QUICK_HORIZON_OPTIONS: { id: QuickHorizonOption; label: string; days?: number }[] = [
  { id: '7d', label: '7 天', days: 7 },
  { id: '30d', label: '30 天', days: 30 },
  { id: '90d', label: '90 天', days: 90 },
  { id: '180d', label: '180 天', days: 180 },
  { id: '1y', label: '1 年' },
  { id: '2y', label: '2 年' },
  { id: 'custom', label: '自訂結束日' },
];

export type ReturnRateConfig = {
  id: string;
  ratePct: number;
  color: string;
};

export const RETURN_RATE_PALETTE = [
  '#166534', // Green
  '#1D4ED8', // Blue
  '#B45309', // Amber
  '#B91C1C', // Red
  '#6D28D9', // Violet
  '#0E7490', // Cyan
  '#C2410C', // Orange
  '#4338CA', // Indigo
  '#047857', // Emerald
  '#BE185D', // Magenta
];

/**
 * Assigns distinct chart colors in the current sorted order of return rates.
 * The palette is intentionally cycled only after all high-contrast colors are used.
 */
export function assignReturnRateColors(rates: ReturnRateConfig[]): ReturnRateConfig[] {
  return [...rates]
    .sort((a, b) => a.ratePct - b.ratePct)
    .map((rate, index) => ({
      ...rate,
      color: RETURN_RATE_PALETTE[index % RETURN_RATE_PALETTE.length],
    }));
}

export const DEFAULT_RETURN_RATES: ReturnRateConfig[] = [
  { id: 'rate-1', ratePct: 10, color: RETURN_RATE_PALETTE[0] },
  { id: 'rate-2', ratePct: 20, color: RETURN_RATE_PALETTE[1] },
  { id: 'rate-3', ratePct: 30, color: RETURN_RATE_PALETTE[2] },
];

/**
 * Calculates target sell price based on compound annualization:
 * target sell price = average buy price * (1 + annualized return) ^ (calendar days held / 365)
 *
 * @param averageBuyPrice Gross average purchase price per share
 * @param annualizedReturnRate Decimal annualized return rate (e.g. 0.20 for 20%, -0.05 for -5%)
 * @param calendarDaysHeld Calendar days held between purchase date and selling date
 */
export function calculateTargetSellPrice(
  averageBuyPrice: number,
  annualizedReturnRate: number,
  calendarDaysHeld: number,
): number {
  if (averageBuyPrice <= 0 || !Number.isFinite(averageBuyPrice)) return 0;
  if (!Number.isFinite(annualizedReturnRate) || annualizedReturnRate <= -1) return 0;
  if (!Number.isFinite(calendarDaysHeld) || calendarDaysHeld < 0) return 0;

  return averageBuyPrice * Math.pow(1 + annualizedReturnRate, calendarDaysHeld / 365);
}

/**
 * Resolves the chart end date given a buy date and a selected horizon option.
 */
export function resolveHorizonEndDate(
  buyDate: string,
  option: QuickHorizonOption,
  customEndDate?: string,
): string {
  const parsed = parseISO(buyDate);
  if (isNaN(parsed.getTime())) return customEndDate ?? buyDate;

  switch (option) {
    case '7d':
      return format(addDays(parsed, 7), 'yyyy-MM-dd');
    case '30d':
      return format(addDays(parsed, 30), 'yyyy-MM-dd');
    case '90d':
      return format(addDays(parsed, 90), 'yyyy-MM-dd');
    case '180d':
      return format(addDays(parsed, 180), 'yyyy-MM-dd');
    case '1y':
      return format(addYears(parsed, 1), 'yyyy-MM-dd');
    case '2y':
      return format(addYears(parsed, 2), 'yyyy-MM-dd');
    case 'custom':
      return customEndDate && customEndDate >= buyDate ? customEndDate : format(addYears(parsed, 1), 'yyyy-MM-dd');
  }
}

export type TargetPricePoint = {
  date: string;
  formattedDate: string;
  calendarDaysHeld: number;
  isTradingDay: boolean;
  [key: string]: string | number | boolean;
};

export type TargetSellPriceSeriesOptions = {
  buyDate: string;
  endDate: string;
  buyPrice: number;
  rates: ReturnRateConfig[];
  preferTradingDays?: boolean;
};

/**
 * Generates data points for the annualized-return target sell price trend chart.
 * Uses calendar days for compounding and filters out non-trading days when preferTradingDays is true.
 */
export function generateTargetSellPriceSeries({
  buyDate,
  endDate,
  buyPrice,
  rates,
  preferTradingDays = true,
}: TargetSellPriceSeriesOptions): TargetPricePoint[] {
  if (buyPrice <= 0 || !buyDate || !endDate || endDate < buyDate) {
    return [];
  }

  const startDateParsed = parseISO(buyDate);
  const endDateParsed = parseISO(endDate);
  if (isNaN(startDateParsed.getTime()) || isNaN(endDateParsed.getTime())) {
    return [];
  }

  const validRates = rates.filter((r) => Number.isFinite(r.ratePct) && r.ratePct > -100);
  if (validRates.length === 0) {
    return [];
  }

  const points: TargetPricePoint[] = [];
  let current = startDateParsed;

  while (current <= endDateParsed) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const trading = isRegularSession(dateStr);

    if (!preferTradingDays || trading) {
      const daysHeld = differenceInCalendarDays(current, startDateParsed);
      const point: TargetPricePoint = {
        date: dateStr,
        formattedDate: dateStr.slice(5).replace('-', '/'),
        calendarDaysHeld: daysHeld,
        isTradingDay: trading,
      };

      for (const rate of validRates) {
        point[`rate_${rate.id}`] = calculateTargetSellPrice(buyPrice, rate.ratePct / 100, daysHeld);
      }

      points.push(point);
    }

    current = addDays(current, 1);
  }

  return points;
}

export type TodayMarkerInfo = {
  date?: string;
  label: string;
  isPastOrToday: boolean;
  isInsideHorizon: boolean;
  calendarDaysHeld?: number;
};

/**
 * Determines whether and where to mark "today" on the chart.
 * If buy date is in the future, returns isPastOrToday = false (projected curve only).
 * If buy date is past/today, identifies the best x-axis point to mark today.
 */
export function findTodayMarkerDate(
  points: TargetPricePoint[],
  todayStr: string,
  buyDate: string,
): TodayMarkerInfo {
  const isPastOrToday = buyDate <= todayStr;
  if (!isPastOrToday || points.length === 0) {
    return { isPastOrToday: false, isInsideHorizon: false, label: '' };
  }

  const daysHeld = differenceInCalendarDays(parseISO(todayStr), parseISO(buyDate));
  const maxDate = points[points.length - 1].date;

  if (todayStr > maxDate) {
    return {
      isPastOrToday: true,
      isInsideHorizon: false,
      calendarDaysHeld: daysHeld,
      label: `今日（${todayStr}，超出選擇區間）`,
    };
  }

  // Check if today matches a point directly
  const exact = points.find((p) => p.date === todayStr);
  if (exact) {
    return {
      date: todayStr,
      label: `今日（${todayStr}）`,
      isPastOrToday: true,
      isInsideHorizon: true,
      calendarDaysHeld: daysHeld,
    };
  }

  // Today is a non-trading day (weekend / holiday); find nearest trading day in range
  const prevSession = [...points].reverse().find((p) => p.date <= todayStr);
  if (prevSession) {
    return {
      date: prevSession.date,
      label: `今日（${todayStr} 休市）`,
      isPastOrToday: true,
      isInsideHorizon: true,
      calendarDaysHeld: daysHeld,
    };
  }

  const nextSession = points.find((p) => p.date >= todayStr);
  if (nextSession) {
    return {
      date: nextSession.date,
      label: `今日（${todayStr} 休市）`,
      isPastOrToday: true,
      isInsideHorizon: true,
      calendarDaysHeld: daysHeld,
    };
  }

  return { isPastOrToday: true, isInsideHorizon: false, label: '', calendarDaysHeld: daysHeld };
}
