import { describe, expect, it } from "vitest";
import { defaultDashboardSettings } from "./datasets";

describe("defaultDashboardSettings", () => {
  it("does not assume an existing assignment obligation", () => {
    expect(defaultDashboardSettings().obligation).toBe("0");
  });
});
