import { describe, expect, it } from "vitest";
import {
  defaultDashboardSettings,
  normalizeDashboardSettings,
} from "./datasets";

describe("defaultDashboardSettings", () => {
  it("stores only analysis controls", () => {
    expect(defaultDashboardSettings().candidate).toBe("");
    expect(defaultDashboardSettings().annualCapitalReturnRatePct).toBe("10");
    expect(defaultDashboardSettings().aggressiveExpirationRiskPct).toBe("5");
    expect(defaultDashboardSettings().aggressiveTouchRiskPct).toBe("10");
  });
});

describe("normalizeDashboardSettings", () => {
  it("drops legacy account fields while preserving analysis controls", () => {
    const legacy = {
      cash: "60000",
      multiple: "1.2",
      obligation: "75000",
      candidate: "71",
      candidateSide: "lower" as const,
      horizon: 1,
    };

    const normalized = normalizeDashboardSettings(legacy);
    expect(normalized.candidate).toBe("71");
    expect(normalized.expiryDate).toBe("");
    expect(normalized.annualCapitalReturnRatePct).toBe("10");
    expect(normalized.aggressiveExpirationRiskPct).toBe("5");
    expect(normalized.aggressiveTouchRiskPct).toBe("10");
    expect("cash" in normalized).toBe(false);
    expect("obligation" in normalized).toBe(false);
  });

  it("preserves a valid annual capital return rate", () => {
    const saved = {
      ...defaultDashboardSettings(),
      annualCapitalReturnRatePct: "15",
    };

    expect(normalizeDashboardSettings(saved).annualCapitalReturnRatePct).toBe("15");
  });

  it("preserves an absolute expiry date in version 4 settings", () => {
    const saved = {
      ...defaultDashboardSettings(),
      expiryDate: "2026-08-19",
    };

    expect(normalizeDashboardSettings(saved).expiryDate).toBe("2026-08-19");
  });
});
