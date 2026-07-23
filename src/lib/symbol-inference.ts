const ignoredTokens = new Set([
  "ETF",
  "STOCK",
  "PRICE",
  "HISTORY",
  "HISTORICAL",
  "DATA",
  "DAILY",
  "WEEKLY",
]);

const companySymbolAliases: Record<string, string> = {
  ALPHABET: "GOOGL",
  AMAZON: "AMZN",
  APPLE: "AAPL",
  GOOGLE: "GOOGL",
  MICROSOFT: "MSFT",
  NVIDIA: "NVDA",
  PALANTIR: "PLTR",
  PALANTIRTECHNOLOGIES: "PLTR",
  TESLA: "TSLA",
};

export type SymbolInference = {
  symbol?: string;
  detectedToken?: string;
  requiresConfirmation: boolean;
};

export function inferSymbolFromFilename(filename: string): SymbolInference {
  const stem = filename.replace(/\.[^.]+$/, "").toUpperCase();
  const tokens = stem.split(/[^A-Z0-9.]+/).filter(Boolean);
  const detectedToken = tokens.find(
    (token) =>
      !ignoredTokens.has(token) &&
      /^[A-Z][A-Z0-9.-]{0,9}$/.test(token),
  );
  if (!detectedToken) return { requiresConfirmation: false };

  const symbol = companySymbolAliases[detectedToken] ?? detectedToken;
  return {
    symbol,
    detectedToken,
    requiresConfirmation:
      symbol !== detectedToken || symbol.length > 5,
  };
}

export function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function isValidSymbol(value: string) {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(normalizeSymbol(value));
}
