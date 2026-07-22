import type { RiskGrade } from "../domain/types";
import { Tooltip } from "./ui/tooltip";

const labels: Record<RiskGrade, string> = {
  conservative: "符合保守門檻",
  safe: "符合安全門檻",
  dangerous: "超出安全門檻",
  insufficient: "證據不足",
  scenario: "情境參考",
};

const explanations: Record<RiskGrade, string> = {
  conservative: "95% 信賴上限符合保守門檻；不代表零風險。",
  safe: "95% 信賴上限符合安全門檻；不代表不會觸及。",
  dangerous: "至少一項 95% 信賴上限超出安全門檻；不代表一定會觸及。",
  insufficient: "有效歷史證據不足以支持決策分級。",
  scenario: "這是情境分析，不提供決策分級。",
};

export function RiskGradeBadge({ grade }: { grade: RiskGrade }) {
  return (
    <Tooltip content={explanations[grade]}>
      <span
        tabIndex={0}
        className={`inline-flex min-h-7 min-w-28 cursor-help items-center justify-center rounded px-2 py-1 text-center text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 risk-${grade}`}
      >
        {labels[grade]}
      </span>
    </Tooltip>
  );
}
