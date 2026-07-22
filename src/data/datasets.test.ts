import { describe, expect, it } from "vitest";
import {
  defaultDashboardSettings,
  normalizeDashboardSettings,
} from "./datasets";

describe("defaultDashboardSettings", () => {
  it("does not assume an existing assignment obligation", () => {
    expect(defaultDashboardSettings().obligation).toBe("0");
  });
});

describe("normalizeDashboardSettings", () => {
  it("removes the unversioned legacy obligation default", () => {
    const legacy = {
      cash: "60000",
      multiple: "1.2",
      obligation: "75000",
      candidate: "71",
      candidateSide: "lower" as const,
      horizon: 1,
    };

    expect(normalizeDashboardSettings(legacy).obligation).toBe("0");
  });

  it("preserves an explicitly saved obligation in current settings", () => {
    const saved = {
      ...defaultDashboardSettings(),
      obligation: "75000",
    };

    expect(normalizeDashboardSettings(saved).obligation).toBe("75000");
  });
});
