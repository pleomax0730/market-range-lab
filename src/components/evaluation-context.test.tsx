import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvaluationContext } from "./evaluation-context";

describe("EvaluationContext", () => {
  it("shows the inherited reference session and target close", () => {
    render(
      <EvaluationContext
        anchorDate="2026-07-17"
        intraday={false}
        targetDate="2026-07-24"
        weeks={1}
      />,
    );

    const context = screen.getByLabelText("自訂價格評估基準");
    expect(context).toHaveTextContent("2026/07/17 ET · 已收盤");
    expect(context).toHaveTextContent("1週目標");
    expect(context).toHaveTextContent("2026/07/24 收盤");
  });
});
