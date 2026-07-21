import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HorizonAnalysis } from "../domain/types";
import { TermHelp } from "./term-help";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  maximumFractionDigits: 2,
});

type DownsideDistributionChartProps = {
  analysis: HorizonAnalysis;
  anchorPrice: number;
  candidate?: number;
  stale: boolean;
};

export function DownsideDistributionChart({
  analysis,
  anchorPrice,
  candidate,
  stale,
}: DownsideDistributionChartProps) {
  const data = useMemo(
    () =>
      analysis.downsideDistribution.map((point) => ({
        ...point,
        price: anchorPrice * (1 + point.returnPct),
      })),
    [analysis.downsideDistribution, anchorPrice],
  );
  const conservative = analysis.lower[0];
  const hasSweetSpot =
    !stale &&
    analysis.weeks <= 4 &&
    conservative.grade === "conservative" &&
    conservative.meetsTarget !== false &&
    Number.isFinite(conservative.price);
  const maximumObserved = Math.max(
    0,
    ...data.flatMap((point) => [point.expirationBreach, point.pathTouch]),
  );
  const yMaximum = Math.max(0.0125, Math.min(0.1, maximumObserved * 1.18));
  const minimumPrice = data[0]?.price ?? 0;
  const maximumPrice = data.at(-1)?.price ?? anchorPrice;
  const visibleCandidate =
    Number.isFinite(candidate) &&
    candidate! > 0 &&
    candidate! >= minimumPrice &&
    candidate! <= maximumPrice
      ? candidate
      : undefined;
  const candidateGap =
    hasSweetSpot && Number.isFinite(candidate) && candidate! > 0
      ? candidate! - conservative.price
      : undefined;

  if (!data.length) return null;

  return (
    <figure className="mb-6 border-b border-[#EFEFEF] pb-5">
      <figcaption className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">下檔尾端累積分布</h3>
            <TermHelp explanation="ECDF（經驗累積分布）：橫軸是候選履約價，縱軸是同類歷史路徑中，週收盤跌破或盤中曾觸及該價格的比例。越靠左通常事件越少。">
              ECDF
            </TermHelp>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#565656]">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[var(--chart-expiration)]" />
              週收盤跌破
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[var(--chart-touch)]" />
              盤中曾觸及
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-xs text-[#6B7280]">
            <TermHelp explanation="保守 Sweet spot 解的是：在到期風險 95% 上限不超過 0.5%、盤中觸及風險 95% 上限不超過 1% 的條件下，找最高的連續價格。它是統計風險約束解，不包含即時權利金、價差與流動性。">
              保守 Sweet spot
            </TermHelp>
          </span>
          <strong className="num text-lg">
            {stale
              ? "分級暫停"
              : analysis.weeks > 4
                ? "情境不分級"
                : conservative.meetsTarget === false
                  ? "門檻不可達"
                  : money.format(conservative.price)}
          </strong>
          {candidateGap !== undefined && (
            <small className="block text-[#6B7280]">
              自訂 {money.format(candidate!)} · {Math.abs(candidateGap) < 0.005
                ? "位於邊界"
                : candidateGap < 0
                  ? `多 ${money.format(-candidateGap)} 下檔緩衝`
                  : `高出邊界 ${money.format(candidateGap)}`}
            </small>
          )}
        </div>
      </figcaption>
      <div
        className="h-[280px] w-full"
        role="img"
        aria-label={`下檔價格累積分布。保守最高合格價為${hasSweetSpot ? money.format(conservative.price) : "目前不可用"}。`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 18, bottom: 8, left: 4 }}
          >
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) => `$${Math.round(value)}`}
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              domain={[0, yMaximum]}
              tickFormatter={(value: number) => percent.format(value)}
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <RechartsTooltip
              labelFormatter={(value) => `履約價 ${money.format(Number(value))}`}
              formatter={(value, name) => [
                percent.format(Number(value)),
                name === "pathTouch" ? "盤中曾觸及" : "週收盤跌破",
              ]}
              contentStyle={{
                background: "var(--chart-tooltip)",
                border: "1px solid var(--chart-grid)",
                borderRadius: 6,
                color: "var(--chart-tooltip-text)",
                fontSize: 12,
              }}
            />
            {hasSweetSpot && (
              <ReferenceArea
                x1={minimumPrice}
                x2={conservative.price}
                fill="var(--chart-conservative)"
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            )}
            {hasSweetSpot && (
              <ReferenceLine
                x={conservative.price}
                stroke="var(--chart-conservative)"
                strokeWidth={2}
                label={{
                  value: `保守上限 ${money.format(conservative.price)}`,
                  position: "insideTopRight",
                  fill: "var(--chart-axis)",
                  fontSize: 12,
                }}
              />
            )}
            {visibleCandidate !== undefined && (
              <ReferenceLine
                x={visibleCandidate}
                stroke="var(--chart-candidate)"
                strokeDasharray="4 4"
                label={{
                  value: `自訂 ${money.format(visibleCandidate)}`,
                  position: "insideBottomLeft",
                  fill: "var(--chart-axis)",
                  fontSize: 12,
                }}
              />
            )}
            <Line
              dataKey="expirationBreach"
              name="expirationBreach"
              type="stepAfter"
              stroke="var(--chart-expiration)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="pathTouch"
              name="pathTouch"
              type="stepAfter"
              stroke="var(--chart-touch)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[#6B7280]">
        綠色區是通過保守門檻的連續價格範圍；實際下單需選擇不高於邊界的可交易履約價。曲線顯示歷史估計，邊界仍以 95% 信賴上限判定。
      </p>
    </figure>
  );
}
