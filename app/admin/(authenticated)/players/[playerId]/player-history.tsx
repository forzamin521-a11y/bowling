"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";

import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { RankMedal } from "@/components/public/rank-medal";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EVENT_TYPE_LABEL,
  MEDAL_EMOJI,
  TOURNAMENT_STATUS_LABEL,
} from "@/lib/domain/labels";
import type { EventType, TournamentStatus } from "@/lib/supabase/database.types";
import { cn, fmtAvg, fmtScore } from "@/lib/utils";

export type EventHistory = {
  eventId: number;
  label: string;
  eventType: EventType;
  gamesCount: number;
  games: { game: number; score: number | null; locked: boolean }[];
  total: number | null;
  avg: number | null;
  rank: number | null;
  pinDiff: number | null;
  teamLabel: string | null;
  teamRank: number | null;
};

export type Participation = {
  tournamentId: number;
  tournamentName: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  playerNumber: number;
  regionName: string;
  affiliationName: string;
  events: EventHistory[];
};

function shortDate(d: string) {
  // "2025-06-21" -> "25.06"
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? `${m[1].slice(2)}.${m[2]}` : d;
}

export function PlayerHistory({
  participations,
}: {
  participations: Participation[];
}) {
  const chart = useMemo(() => buildChart(participations), [participations]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">참가 이력</CardTitle>
        <CardDescription>대회별 종목·게임 성적</CardDescription>
      </CardHeader>
      <CardContent>
        {participations.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            참가한 대회가 없습니다.
          </p>
        ) : (
          <Tabs defaultValue="data" className="block min-w-0">
            <TabsList className="mb-4 h-10 w-full">
              <TabsTrigger value="data">
                <Table2 className="size-4" />
                데이터
              </TabsTrigger>
              <TabsTrigger value="chart">
                <BarChart3 className="size-4" />
                차트
              </TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="block w-full">
              <div className="grid gap-4">
                {participations.map((p) => (
                  <ParticipationCard key={p.tournamentId} p={p} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="chart" className="block w-full">
              <ChartView chart={chart} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(d: string) {
  // "2025-06-21" -> "2025.06.21"
  return d.replaceAll("-", ".");
}

function ParticipationCard({ p }: { p: Participation }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/40 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/tournaments/${p.tournamentId}`}
            className="text-[15px] font-semibold leading-snug hover:underline"
          >
            {p.tournamentName}
          </Link>
          <Badge
            variant={
              p.status === "ongoing"
                ? "default"
                : p.status === "upcoming"
                  ? "secondary"
                  : "outline"
            }
          >
            {TOURNAMENT_STATUS_LABEL[p.status]}
          </Badge>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {fmtDate(p.startDate)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {p.regionName} {p.affiliationName} · 대회배번 {p.playerNumber}
        </p>
      </div>

      {p.events.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          기록된 성적이 없습니다.
        </p>
      ) : (
        <div className="divide-y">
          {p.events.map((e) => (
            <EventHistoryRow key={e.eventId} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventHistoryRow({ event: e }: { event: EventHistory }) {
  const lockedScores = e.games
    .filter((g) => g.locked && g.score != null)
    .map((g) => g.score as number);
  const best = lockedScores.length ? Math.max(...lockedScores) : null;

  return (
    <div className="px-3 py-3.5 sm:px-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {e.rank != null && e.rank <= 3 ? <RankMedal rank={e.rank} /> : null}
        <span className="text-sm font-semibold">
          {EVENT_TYPE_LABEL[e.eventType]}
        </span>
        <span className="text-xs text-muted-foreground">{e.label}</span>
        {e.rank != null && e.rank > 3 ? (
          <Badge variant="outline" className="tabular-nums">
            {e.rank}위
          </Badge>
        ) : null}
        {e.teamLabel ? (
          <Badge variant="ghost" className="text-muted-foreground">
            팀 {e.teamLabel}
            {e.teamRank != null ? ` · ${e.teamRank}위` : ""}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {e.games.map((g) => {
          const isBest = g.locked && g.score != null && g.score === best;
          return (
            <div
              key={g.game}
              className={cn(
                "w-11 rounded-lg border py-1 text-center",
                g.locked
                  ? isBest
                    ? "border-primary/40 bg-primary/[0.07]"
                    : "bg-muted/40"
                  : "border-dashed opacity-60",
              )}
              title={isBest ? "이 종목 최고 게임" : undefined}
            >
              <div className="text-[10px] leading-none text-muted-foreground">
                {g.game}G
              </div>
              <div
                className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums leading-tight",
                  isBest && "text-primary",
                )}
              >
                {g.locked ? (g.score ?? "–") : "·"}
              </div>
            </div>
          );
        })}

        <div className="ms-auto flex items-center gap-1.5">
          <SummaryChip
            label="합계"
            value={e.total == null ? "–" : fmtScore(e.total)}
            strong
          />
          <SummaryChip label="평균" value={fmtAvg(e.avg)} />
          {e.pinDiff != null && e.pinDiff !== 0 ? (
            <SummaryChip label="핀차" value={fmtScore(e.pinDiff)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-1 text-center",
        strong ? "bg-primary/10" : "bg-muted/60",
      )}
    >
      <div
        className={cn(
          "text-[10px] leading-none",
          strong ? "text-primary/80" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums leading-tight",
          strong && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---- 차트 ----

type ChartData = {
  labels: string[];
  series: LineSeries[];
  tooltips: string[][];
  empty: boolean;
  stats: { best: number; mean: number; recent: number } | null;
};

function buildChart(participations: Participation[]): ChartData {
  // 오래된 → 최근 순으로 이벤트를 평탄화
  const ordered = [...participations].sort((a, b) =>
    a.startDate < b.startDate ? -1 : 1,
  );

  const labels: string[] = [];
  const avg: number[] = [];
  const emphasis: boolean[] = [];
  const tooltips: string[][] = [];

  for (const p of ordered) {
    for (const e of p.events) {
      if (e.avg == null) continue;
      labels.push(shortDate(p.startDate));
      avg.push(e.avg);
      emphasis.push(e.rank != null && e.rank <= 3);
      tooltips.push(
        [
          p.tournamentName,
          `${e.label} ${EVENT_TYPE_LABEL[e.eventType]}`,
          `평균 ${fmtAvg(e.avg)}`,
          e.total != null ? `합계 ${fmtScore(e.total)}` : "",
          e.rank != null ? `${MEDAL_EMOJI[e.rank] ?? ""}${e.rank}위` : "",
        ].filter(Boolean),
      );
    }
  }

  return {
    labels,
    series: [{ name: "평균", color: "var(--chart-2)", values: avg, emphasis }],
    tooltips,
    empty: avg.length === 0,
    stats: avg.length
      ? {
          best: Math.max(...avg),
          mean: avg.reduce((a, b) => a + b, 0) / avg.length,
          recent: avg[avg.length - 1],
        }
      : null,
  };
}

function ChartView({ chart }: { chart: ChartData }) {
  if (chart.empty || !chart.stats) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        차트로 표시할 성적 데이터가 없습니다.
      </p>
    );
  }

  const { best, mean, recent } = chart.stats;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="최고 평균" value={fmtAvg(best)} />
        <Stat label="전체 평균" value={fmtAvg(mean)} />
        <Stat label="최근 평균" value={fmtAvg(recent)} />
      </div>

      <div className="rounded-lg border p-3">
        <p className="mb-1 text-sm font-medium">평균 점수 추이</p>
        <p className="mb-2 text-xs text-muted-foreground">
          종목별 평균 점수를 시간 순으로 표시합니다.{" "}
          <span className="text-[var(--gold)]">●</span> 입상(1~3위)
        </p>
        <LineChart
          labels={chart.labels}
          series={chart.series}
          tooltips={chart.tooltips}
          formatValue={(v) => String(Math.round(v))}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
