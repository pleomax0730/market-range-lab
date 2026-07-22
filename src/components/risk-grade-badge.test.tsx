import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskGradeBadge } from "./risk-grade-badge";
import { TooltipProvider } from "./ui/tooltip";

describe("RiskGradeBadge", () => {
  it("describes decision grades as threshold classifications", () => {
    render(
      <TooltipProvider>
        <RiskGradeBadge grade="conservative" />
        <RiskGradeBadge grade="safe" />
        <RiskGradeBadge grade="dangerous" />
      </TooltipProvider>,
    );

    expect(screen.getByText("符合保守門檻")).toBeInTheDocument();
    expect(screen.getByText("符合安全門檻")).toBeInTheDocument();
    expect(screen.getByText("超出安全門檻")).toHaveAttribute("tabindex", "0");
    expect(screen.queryByText("危險")).not.toBeInTheDocument();
  });
});
