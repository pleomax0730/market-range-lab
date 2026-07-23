import { describe, expect, it } from "vitest";
import {
  inferSymbolFromFilename,
  isValidSymbol,
  normalizeSymbol,
} from "./symbol-inference";

describe("symbol inference", () => {
  it("keeps ticker-like filenames on the one-click import path", () => {
    expect(inferSymbolFromFilename("SOXL ETF Stock Price History Daily.csv")).toEqual({
      symbol: "SOXL",
      detectedToken: "SOXL",
      requiresConfirmation: false,
    });
  });

  it("maps common company names and asks for confirmation", () => {
    expect(inferSymbolFromFilename("PALANTIR ETF Stock Price History Daily.csv")).toEqual({
      symbol: "PLTR",
      detectedToken: "PALANTIR",
      requiresConfirmation: true,
    });
  });

  it("requires confirmation for an unknown long filename token", () => {
    expect(inferSymbolFromFilename("ACMECO Historical Data.csv")).toEqual({
      symbol: "ACMECO",
      detectedToken: "ACMECO",
      requiresConfirmation: true,
    });
  });

  it("normalizes and validates Yahoo-style symbols", () => {
    expect(normalizeSymbol(" pltr ")).toBe("PLTR");
    expect(isValidSymbol("PLTR")).toBe(true);
    expect(isValidSymbol("PALANTIR TECHNOLOGIES")).toBe(false);
  });
});
