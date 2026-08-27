export type SymbolKey = "SOXL" | "TQQQ" | "NVDA";
export type RiskKey = "conservative" | "safe" | "aggressive";
export type VariantKey = "signal" | "canvas" | "night";

export type SymbolProfile = {
  name: string;
  price: number;
  change: number;
  history: string;
  sessions: number;
  floor: Record<RiskKey, number>;
  touch: Record<RiskKey, number>;
  expiry: Record<RiskKey, number>;
  recovery: Record<RiskKey, number[]>;
};

export const profiles: Record<SymbolKey, SymbolProfile> = {
  SOXL: {
    name: "Direxion Semiconductor Bull 3X",
    price: 129.1,
    change: -3.42,
    history: "Daily · 2010–2026",
    sessions: 4132,
    floor: { conservative: 0.48, safe: 0.67, aggressive: 0.78 },
    touch: { conservative: 0.8, safe: 2.9, aggressive: 8.4 },
    expiry: { conservative: 0.3, safe: 1.2, aggressive: 4.7 },
    recovery: {
      conservative: [82, 91, 96, 98],
      safe: [68, 84, 92, 96],
      aggressive: [51, 72, 85, 92],
    },
  },
  TQQQ: {
    name: "ProShares UltraPro QQQ",
    price: 76.79,
    change: 0.86,
    history: "Daily · 2010–2026",
    sessions: 4135,
    floor: { conservative: 0.63, safe: 0.78, aggressive: 0.87 },
    touch: { conservative: 0.6, safe: 2.4, aggressive: 7.1 },
    expiry: { conservative: 0.2, safe: 1.0, aggressive: 3.9 },
    recovery: {
      conservative: [87, 94, 97, 99],
      safe: [74, 88, 94, 97],
      aggressive: [59, 78, 88, 94],
    },
  },
  NVDA: {
    name: "NVIDIA Corporation",
    price: 181.6,
    change: -1.18,
    history: "Daily · 1999–2026",
    sessions: 4998,
    floor: { conservative: 0.74, safe: 0.84, aggressive: 0.9 },
    touch: { conservative: 0.5, safe: 1.9, aggressive: 6.3 },
    expiry: { conservative: 0.2, safe: 0.8, aggressive: 3.2 },
    recovery: {
      conservative: [91, 96, 98, 99],
      safe: [81, 91, 96, 98],
      aggressive: [69, 84, 92, 96],
    },
  },
};

export const expiries = [
  { days: 1, label: "本週五", date: "8/28" },
  { days: 4, label: "下週三", date: "9/2" },
  { days: 6, label: "下週五", date: "9/4" },
  { days: 11, label: "隔週五", date: "9/11" },
  { days: 16, label: "3 週", date: "9/18" },
  { days: 26, label: "5 週", date: "10/2" },
  { days: 36, label: "7 週", date: "10/16" },
];

export const riskCopy: Record<
  RiskKey,
  { label: string; short: string; description: string }
> = {
  conservative: {
    label: "保守",
    short: "把罕見尾部留在外面",
    description: "優先壓低到期跌破與期間觸及；可能犧牲大量 Premium。",
  },
  safe: {
    label: "安全",
    short: "證據與價格的平衡點",
    description: "以單側風險上限控制歷史失敗率，但仍不是保證。",
  },
  aggressive: {
    label: "激進",
    short: "接受更高觸及換取距離",
    description: "價格更靠近現價，適合主動承擔較高履約風險的情境。",
  },
};

export function buildSnapshot(
  symbol: SymbolKey,
  days: number,
  selected: RiskKey,
) {
  const profile = profiles[symbol];
  const horizon = Math.sqrt(days / 5);
  const levels = (Object.keys(profile.floor) as RiskKey[]).map((risk) => {
    const baseDrop = 1 - profile.floor[risk];
    const adjustedDrop = Math.min(baseDrop * horizon, 0.72);
    const strike = profile.price * (1 - adjustedDrop);
    const eventScale = Math.min(1 + (days - 5) * 0.035, 2.2);
    return {
      risk,
      strike,
      discount: ((strike / profile.price) - 1) * 100,
      expiry: Math.min(profile.expiry[risk] * eventScale, 28),
      touch: Math.min(profile.touch[risk] * eventScale, 44),
      events: Math.max(104, Math.round(profile.sessions / Math.max(days, 4))),
    };
  });

  return {
    profile,
    levels,
    active: levels.find((level) => level.risk === selected)!,
    confidence: days <= 20 ? "決策級" : "情境級",
    remaining: days,
  };
}
