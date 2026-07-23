import { ArrowRight, CalendarDays } from "lucide-react";

type EvaluationContextProps = {
  anchorDate: string;
  intraday: boolean;
  targetDate: string;
  weeks: number;
};

function displayDate(date: string) {
  return date.replaceAll("-", "/");
}

export function EvaluationContext({
  anchorDate,
  intraday,
  targetDate,
  weeks,
}: EvaluationContextProps) {
  return (
    <div
      aria-label="自訂價格評估基準"
      className="min-w-0 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[#A3FF3F] pl-3 text-xs"
    >
      <CalendarDays aria-hidden="true" className="text-[#565656]" size={15} />
      <span className="text-[#6B7280]">評估基準</span>
      <strong className="num text-[#0D0D0D]">
        {displayDate(anchorDate)} ET · {intraday ? "盤中" : "已收盤"}
      </strong>
      <ArrowRight aria-hidden="true" className="text-[#9CA3AF]" size={14} />
      <span className="text-[#6B7280]">{weeks}週目標</span>
      <strong className="num text-[#0D0D0D]">
        {displayDate(targetDate)} 收盤
      </strong>
    </div>
  );
}
