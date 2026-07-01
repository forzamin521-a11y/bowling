"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type LineSeries = {
  /** 범례/툴팁에 쓰이는 이름 */
  name: string;
  /** CSS 색상 (예: "var(--chart-2)") */
  color: string;
  /** y 값 배열. null 은 결측치로 선을 끊는다. */
  values: (number | null)[];
  /** 점 강조 여부 (예: 입상) */
  emphasis?: boolean[];
};

export type LineChartProps = {
  /** x축 라벨 (각 데이터 인덱스에 대응) */
  labels: string[];
  series: LineSeries[];
  /** 점 위에 표시할 툴팁 라인들 (인덱스별) */
  tooltips?: string[][];
  /** y축 단위/포맷 */
  formatValue?: (v: number) => string;
  className?: string;
  height?: number;
  /** y축 0부터 시작할지 여부 (false 면 데이터 범위에 맞춤) */
  zeroBased?: boolean;
};

const W = 760;

function niceBounds(min: number, max: number, zeroBased: boolean) {
  // zeroBased라도 음수 데이터가 있으면 0으로 잘라내지 않는다.
  let lo = zeroBased ? Math.min(0, min) : min;
  let hi = max;
  if (lo === hi) {
    lo = lo - 10;
    hi = hi + 10;
    // 데이터가 모두 0 이상이면 0을 기준선으로 유지
    if (min >= 0 && lo < 0) lo = 0;
  }
  const range = hi - lo;
  const step = niceStep(range / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  return { lo, hi, step };
}

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return m * pow;
}

export function LineChart({
  labels,
  series,
  tooltips,
  formatValue = (v) => String(Math.round(v)),
  className,
  height = 260,
  zeroBased = false,
}: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const n = labels.length;
  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 30;
  const H = height;

  const allVals = series
    .flatMap((s) => s.values)
    .filter((v): v is number => v != null);
  const dataMin = allVals.length ? Math.min(...allVals) : 0;
  const dataMax = allVals.length ? Math.max(...allVals) : 100;
  const { lo, hi, step } = niceBounds(dataMin, dataMax, zeroBased);

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);

  // x축 라벨이 빽빽하면 일부만 표시
  const labelEvery = n > 8 ? Math.ceil(n / 8) : 1;

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        {/* y 그리드 + 라벨 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yAt(t)}
              y2={yAt(t)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={t === lo ? undefined : "3 3"}
            />
            <text
              x={padL - 6}
              y={yAt(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {formatValue(t)}
            </text>
          </g>
        ))}

        {/* x 라벨 */}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - padB + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {l}
            </text>
          ) : null,
        )}

        {/* 호버 세로선 */}
        {hover != null && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={padT}
            y2={padT + innerH}
            className="stroke-foreground/25"
            strokeWidth={1}
          />
        )}

        {/* 시리즈 선 + 점 */}
        {series.map((s) => {
          const segments: string[] = [];
          let cur: string[] = [];
          s.values.forEach((v, i) => {
            if (v == null) {
              if (cur.length) segments.push(cur.join(" "));
              cur = [];
            } else {
              cur.push(`${cur.length ? "L" : "M"}${xAt(i)} ${yAt(v)}`);
            }
          });
          if (cur.length) segments.push(cur.join(" "));
          return (
            <g key={s.name}>
              {segments.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {s.values.map((v, i) =>
                v == null ? null : (
                  <circle
                    key={i}
                    cx={xAt(i)}
                    cy={yAt(v)}
                    r={s.emphasis?.[i] ? 5 : hover === i ? 4.5 : 3}
                    fill={s.emphasis?.[i] ? "var(--gold)" : s.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                ),
              )}
            </g>
          );
        })}

        {/* 호버 히트 영역 */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={n <= 1 ? padL : xAt(i) - innerW / (2 * (n - 1 || 1))}
            y={padT}
            width={n <= 1 ? innerW : innerW / (n - 1 || 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* 툴팁 */}
      {hover != null && tooltips?.[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(xAt(hover) / W) * 100}%`,
            top: 4,
          }}
        >
          {tooltips[hover].map((line, i) => (
            <div
              key={i}
              className={i === 0 ? "font-medium" : "text-muted-foreground"}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* 범례 */}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
