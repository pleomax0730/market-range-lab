import { describe, expect, it } from 'vitest';
import {
  calculateTargetSellPrice,
  assignReturnRateColors,
  findTodayMarkerDate,
  generateTargetSellPriceSeries,
  resolveHorizonEndDate,
  type ReturnRateConfig,
} from './annualized-return';

describe('assignReturnRateColors', () => {
  it('assigns distinct palette colors to sorted rates', () => {
    const rates: ReturnRateConfig[] = [
      { id: '40', ratePct: 40, color: '#000000' },
      { id: '10', ratePct: 10, color: '#000000' },
      { id: '50', ratePct: 50, color: '#000000' },
      { id: '20', ratePct: 20, color: '#000000' },
    ];

    const colored = assignReturnRateColors(rates);

    expect(colored.map((rate) => rate.ratePct)).toEqual([10, 20, 40, 50]);
    expect(new Set(colored.map((rate) => rate.color)).size).toBe(4);
  });
});

describe('calculateTargetSellPrice', () => {
  it('returns average buy price when calendar days held is 0', () => {
    const price = calculateTargetSellPrice(100, 0.2, 0);
    expect(price).toBe(100);
  });

  it('calculates compound annual return for exactly 365 days', () => {
    const price = calculateTargetSellPrice(100, 0.2, 365);
    expect(price).toBeCloseTo(120, 4);
  });

  it('calculates compound annual return for 2 years (730 days)', () => {
    const price = calculateTargetSellPrice(100, 0.2, 730);
    expect(price).toBeCloseTo(144, 4);
  });

  it('calculates partial year return correctly', () => {
    // Half year: (1 + 0.21) ^ 0.5 = 1.10
    const price = calculateTargetSellPrice(100, 0.21, 182.5);
    expect(price).toBeCloseTo(110, 2);
  });

  it('handles negative annualized return rate', () => {
    const price = calculateTargetSellPrice(100, -0.1, 365);
    expect(price).toBeCloseTo(90, 4);
  });

  it('returns 0 for invalid buy price', () => {
    expect(calculateTargetSellPrice(0, 0.1, 30)).toBe(0);
    expect(calculateTargetSellPrice(-50, 0.1, 30)).toBe(0);
  });

  it('returns 0 for return rate <= -100%', () => {
    expect(calculateTargetSellPrice(100, -1.0, 30)).toBe(0);
    expect(calculateTargetSellPrice(100, -1.5, 30)).toBe(0);
  });

  it('returns 0 for negative days held', () => {
    expect(calculateTargetSellPrice(100, 0.1, -1)).toBe(0);
  });
});

describe('resolveHorizonEndDate', () => {
  const buyDate = '2026-01-01';

  it('resolves 7 days', () => {
    expect(resolveHorizonEndDate(buyDate, '7d')).toBe('2026-01-08');
  });

  it('resolves 30 days', () => {
    expect(resolveHorizonEndDate(buyDate, '30d')).toBe('2026-01-31');
  });

  it('resolves 90 days', () => {
    expect(resolveHorizonEndDate(buyDate, '90d')).toBe('2026-04-01');
  });

  it('resolves 180 days', () => {
    expect(resolveHorizonEndDate(buyDate, '180d')).toBe('2026-06-30');
  });

  it('resolves 1 year (default horizon)', () => {
    expect(resolveHorizonEndDate(buyDate, '1y')).toBe('2027-01-01');
  });

  it('resolves 2 years', () => {
    expect(resolveHorizonEndDate(buyDate, '2y')).toBe('2028-01-01');
  });

  it('handles custom end date', () => {
    expect(resolveHorizonEndDate(buyDate, 'custom', '2026-08-15')).toBe('2026-08-15');
  });

  it('falls back to 1 year if custom end date is before buy date', () => {
    expect(resolveHorizonEndDate(buyDate, 'custom', '2025-12-31')).toBe('2027-01-01');
  });
});

describe('generateTargetSellPriceSeries', () => {
  const rates: ReturnRateConfig[] = [
    { id: '10', ratePct: 10, color: '#1859A9' },
    { id: '20', ratePct: 20, color: '#137A3D' },
  ];

  it('excludes weekends and market holidays when preferTradingDays is true', () => {
    // 2026-01-01 is New Year's Day (holiday)
    // 2026-01-02 is Friday (trading session)
    // 2026-01-03 is Saturday (weekend)
    // 2026-01-04 is Sunday (weekend)
    // 2026-01-05 is Monday (trading session)
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-01-01',
      endDate: '2026-01-07',
      buyPrice: 100,
      rates,
      preferTradingDays: true,
    });

    const dates = points.map((p) => p.date);
    expect(dates).not.toContain('2026-01-01'); // Market holiday
    expect(dates).toContain('2026-01-02'); // Friday
    expect(dates).not.toContain('2026-01-03'); // Saturday
    expect(dates).not.toContain('2026-01-04'); // Sunday
    expect(dates).toContain('2026-01-05'); // Monday
    expect(dates).toContain('2026-01-06'); // Tuesday
    expect(dates).toContain('2026-01-07'); // Wednesday

    // Points calculate prices for each rate
    const fri = points.find((p) => p.date === '2026-01-02')!;
    expect(fri.calendarDaysHeld).toBe(1);
    expect(Number(fri.rate_10)).toBeCloseTo(100 * Math.pow(1.1, 1 / 365), 4);
    expect(Number(fri.rate_20)).toBeCloseTo(100 * Math.pow(1.2, 1 / 365), 4);
  });

  it('includes all calendar days when preferTradingDays is false', () => {
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-01-01',
      endDate: '2026-01-05',
      buyPrice: 100,
      rates,
      preferTradingDays: false,
    });

    expect(points).toHaveLength(5);
    expect(points.map((p) => p.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });

  it('returns empty array when endDate < buyDate', () => {
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-05-01',
      endDate: '2026-04-01',
      buyPrice: 100,
      rates,
    });
    expect(points).toEqual([]);
  });

  it('returns empty array when buyPrice <= 0', () => {
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-01-01',
      endDate: '2026-02-01',
      buyPrice: 0,
      rates,
    });
    expect(points).toEqual([]);
  });
});

describe('findTodayMarkerDate', () => {
  const rates: ReturnRateConfig[] = [{ id: '1', ratePct: 10, color: '#1859A9' }];

  it('returns isPastOrToday = false when buy date is in the future', () => {
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-10-01',
      endDate: '2027-10-01',
      buyPrice: 100,
      rates,
    });

    const marker = findTodayMarkerDate(points, '2026-09-05', '2026-10-01');
    expect(marker.isPastOrToday).toBe(false);
    expect(marker.date).toBeUndefined();
  });

  it('marks today directly when today is a trading date in range', () => {
    // 2026-01-02 is a trading date
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-01-01',
      endDate: '2026-01-10',
      buyPrice: 100,
      rates,
      preferTradingDays: true,
    });

    const marker = findTodayMarkerDate(points, '2026-01-02', '2026-01-01');
    expect(marker.isPastOrToday).toBe(true);
    expect(marker.isInsideHorizon).toBe(true);
    expect(marker.date).toBe('2026-01-02');
    expect(marker.calendarDaysHeld).toBe(1);
  });

  it('maps to nearest trading date when today is on a weekend in range', () => {
    // 2026-01-03 is Saturday
    const points = generateTargetSellPriceSeries({
      buyDate: '2026-01-01',
      endDate: '2026-01-10',
      buyPrice: 100,
      rates,
      preferTradingDays: true,
    });

    const marker = findTodayMarkerDate(points, '2026-01-03', '2026-01-01');
    expect(marker.isPastOrToday).toBe(true);
    expect(marker.isInsideHorizon).toBe(true);
    // Friday 2026-01-02 is the preceding trading day in points
    expect(marker.date).toBe('2026-01-02');
    expect(marker.calendarDaysHeld).toBe(2);
  });

  it('indicates outside horizon if today is after chart end date', () => {
    const points = generateTargetSellPriceSeries({
      buyDate: '2025-01-01',
      endDate: '2025-06-01',
      buyPrice: 100,
      rates,
    });

    const marker = findTodayMarkerDate(points, '2026-09-05', '2025-01-01');
    expect(marker.isPastOrToday).toBe(true);
    expect(marker.isInsideHorizon).toBe(false);
  });
});
