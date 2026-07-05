import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankMedal, podiumRowClass } from "@/components/public/rank-medal";
import {
  categoryFullLabel,
  EVENT_TYPE_LABEL,
  GENDER_LABEL,
} from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import type {
  CategoryAge,
  EventType,
  Gender,
  TournamentStatus,
} from "@/lib/supabase/database.types";

import {
  PlayerHistory,
  type EventHistory,
  type Participation,
} from "./player-history";

export const dynamic = "force-dynamic";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const pid = Number(playerId);
  if (!Number.isFinite(pid)) notFound();

  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, name, region_id, affiliation_name, birth_year, gender")
    .eq("id", pid)
    .maybeSingle();
  if (!player) notFound();

  const { data: tps } = await supabase
    .from("tournament_players")
    .select("id, tournament_id, region_id, affiliation_name, player_number")
    .eq("player_id", pid);
  const tpList = tps ?? [];
  const tpIds = tpList.map((t) => t.id);

  // 병렬 배치 조회 (N+1 방지)
  const tournamentIds = [...new Set(tpList.map((t) => t.tournament_id))];
  const [
    { data: regions },
    { data: tournaments },
    { data: rankRows },
    { data: scoreRows },
    { data: memberRows },
  ] = await Promise.all([
    supabase.from("regions").select("id, name"),
    tournamentIds.length
      ? supabase
          .from("tournaments_with_status")
          .select("id, name, start_date, end_date, status")
          .in("id", tournamentIds)
      : Promise.resolve({ data: [] as never[] }),
    tpIds.length
      ? supabase
          .from("rankings")
          .select(
            "tournament_player_id, tournament_event_id, total, avg, rank, pin_diff_from_first",
          )
          .in("tournament_player_id", tpIds)
      : Promise.resolve({ data: [] as never[] }),
    tpIds.length
      ? supabase
          .from("scores")
          .select("tournament_player_id, tournament_event_id, game_number, score")
          .in("tournament_player_id", tpIds)
      : Promise.resolve({ data: [] as never[] }),
    tpIds.length
      ? supabase
          .from("tournament_team_members")
          .select("tournament_team_id, tournament_player_id")
          .in("tournament_player_id", tpIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));
  const tournamentById = new Map(
    (tournaments ?? []).map((t) => [t.id, t]),
  );

  // 이벤트 집합 (랭킹 ∪ 점수)
  const eventIds = [
    ...new Set([
      ...(rankRows ?? []).map((r) => r.tournament_event_id),
      ...(scoreRows ?? []).map((s) => s.tournament_event_id),
    ]),
  ];

  // 팀 메타 + 팀 랭킹
  const teamIds = [...new Set((memberRows ?? []).map((m) => m.tournament_team_id))];
  const [{ data: eventRows }, { data: teamRows }, { data: teamRankRows }] =
    await Promise.all([
      eventIds.length
        ? supabase
            .from("tournament_events")
            .select("id, tournament_category_id, event_type, games_count")
            .in("id", eventIds)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabase
            .from("tournament_teams")
            .select("id, tournament_event_id, team_label, team_seq")
            .in("id", teamIds)
        : Promise.resolve({ data: [] as never[] }),
      teamIds.length
        ? supabase
            .from("team_rankings")
            .select("tournament_team_id, rank")
            .in("tournament_team_id", teamIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const categoryIds = [
    ...new Set((eventRows ?? []).map((e) => e.tournament_category_id)),
  ];
  const [{ data: categoryRows }, { data: gsRows }] = await Promise.all([
    categoryIds.length
      ? supabase
          .from("tournament_categories")
          .select("id, age, gender")
          .in("id", categoryIds)
      : Promise.resolve({ data: [] as never[] }),
    eventIds.length
      ? supabase
          .from("game_states")
          .select("tournament_event_id, game_number, status")
          .in("tournament_event_id", eventIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const eventMeta = new Map(
    (eventRows ?? []).map((e) => [
      e.id,
      {
        categoryId: e.tournament_category_id,
        eventType: e.event_type as EventType,
        gamesCount: e.games_count,
      },
    ]),
  );
  const categoryMeta = new Map(
    (categoryRows ?? []).map((c) => [
      c.id,
      { age: c.age as CategoryAge, gender: c.gender as Gender },
    ]),
  );
  const lockedByEvent = new Map<number, Set<number>>();
  for (const g of gsRows ?? []) {
    if (g.status !== "locked") continue;
    const set = lockedByEvent.get(g.tournament_event_id) ?? new Set<number>();
    set.add(g.game_number);
    lockedByEvent.set(g.tournament_event_id, set);
  }

  const rankingByKey = new Map(
    (rankRows ?? []).map((r) => [
      `${r.tournament_player_id}:${r.tournament_event_id}`,
      r,
    ]),
  );
  const scoresByKey = new Map<string, Map<number, number>>();
  for (const s of scoreRows ?? []) {
    const k = `${s.tournament_player_id}:${s.tournament_event_id}`;
    const m = scoresByKey.get(k) ?? new Map<number, number>();
    m.set(s.game_number, s.score);
    scoresByKey.set(k, m);
  }
  const eventsByTp = new Map<number, Set<number>>();
  for (const r of rankRows ?? []) {
    const set = eventsByTp.get(r.tournament_player_id) ?? new Set<number>();
    set.add(r.tournament_event_id);
    eventsByTp.set(r.tournament_player_id, set);
  }
  for (const s of scoreRows ?? []) {
    const set = eventsByTp.get(s.tournament_player_id) ?? new Set<number>();
    set.add(s.tournament_event_id);
    eventsByTp.set(s.tournament_player_id, set);
  }

  const teamMeta = new Map(
    (teamRows ?? []).map((t) => [
      t.id,
      {
        eventId: t.tournament_event_id,
        label: `${t.team_label}${t.team_seq > 1 ? `-${t.team_seq}` : ""}`,
      },
    ]),
  );
  const teamRankByTeam = new Map(
    (teamRankRows ?? []).map((t) => [t.tournament_team_id, t.rank]),
  );
  // (tpId:eventId) -> { label, rank }
  const teamByKey = new Map<string, { label: string; rank: number | null }>();
  for (const m of memberRows ?? []) {
    const meta = teamMeta.get(m.tournament_team_id);
    if (!meta) continue;
    teamByKey.set(`${m.tournament_player_id}:${meta.eventId}`, {
      label: meta.label,
      rank: teamRankByTeam.get(m.tournament_team_id) ?? null,
    });
  }

  // 참가 이력 조립
  const participations: Participation[] = tpList
    .map((tp) => {
      const tournament = tournamentById.get(tp.tournament_id);
      const evIds = [...(eventsByTp.get(tp.id) ?? [])];
      const events: EventHistory[] = evIds
        .map((eid) => {
          const meta = eventMeta.get(eid);
          if (!meta) return null;
          const cat = categoryMeta.get(meta.categoryId);
          const ranking = rankingByKey.get(`${tp.id}:${eid}`);
          const scoreMap = scoresByKey.get(`${tp.id}:${eid}`) ?? new Map();
          const locked = lockedByEvent.get(eid) ?? new Set<number>();
          const team = teamByKey.get(`${tp.id}:${eid}`);
          const games = Array.from({ length: meta.gamesCount }, (_, i) => {
            const g = i + 1;
            return {
              game: g,
              score: scoreMap.get(g) ?? null,
              locked: locked.has(g),
            };
          });
          return {
            eventId: eid,
            label: cat
              ? categoryFullLabel(cat.age, cat.gender)
              : "",
            eventType: meta.eventType,
            gamesCount: meta.gamesCount,
            games,
            total: ranking?.total ?? null,
            avg: ranking?.avg == null ? null : Number(ranking.avg),
            rank: ranking?.rank ?? null,
            pinDiff: ranking?.pin_diff_from_first ?? null,
            teamLabel: team?.label ?? null,
            teamRank: team?.rank ?? null,
          } satisfies EventHistory;
        })
        .filter((e): e is EventHistory => e !== null)
        .sort((a, b) =>
          EVENT_TYPE_ORDER_INDEX(a.eventType) - EVENT_TYPE_ORDER_INDEX(b.eventType),
        );

      return {
        tournamentId: tp.tournament_id,
        tournamentName: tournament?.name ?? "(삭제된 대회)",
        startDate: tournament?.start_date ?? "",
        endDate: tournament?.end_date ?? "",
        status: (tournament?.status ?? "upcoming") as TournamentStatus,
        playerNumber: tp.player_number,
        regionName: regionById.get(tp.region_id) ?? "",
        affiliationName: tp.affiliation_name,
        events,
      } satisfies Participation;
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  // 수상 이력 (종료 대회에서 개인/팀 순위 1~3위)
  const awards: { tournamentName: string; label: string; rank: number; kind: "개인" | "팀" }[] =
    [];
  for (const p of participations) {
    if (p.status !== "finished") continue;
    for (const e of p.events) {
      if (e.rank != null && e.rank <= 3) {
        awards.push({
          tournamentName: p.tournamentName,
          label: `${e.label} ${EVENT_TYPE_LABEL[e.eventType]}`,
          rank: e.rank,
          kind: "개인",
        });
      }
      if (e.teamRank != null && e.teamRank <= 3) {
        awards.push({
          tournamentName: p.tournamentName,
          label: `${e.label} ${EVENT_TYPE_LABEL[e.eventType]} (팀)`,
          rank: e.teamRank,
          kind: "팀",
        });
      }
    }
  }
  awards.sort((a, b) => a.rank - b.rank);

  // 헤더 요약 통계
  const allAvgs = participations
    .flatMap((p) => p.events)
    .map((e) => e.avg)
    .filter((v): v is number => v != null);
  const bestAvg = allAvgs.length ? Math.max(...allAvgs) : null;
  const bestRank = awards.length ? awards[0].rank : null;
  const medalCounts = [1, 2, 3].map(
    (r) => awards.filter((a) => a.rank === r).length,
  );
  const initial = player.name.trim().slice(0, 1) || "?";

  return (
    <div className="grid max-w-4xl gap-6">
      <Link
        href="/admin/players"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        선수 마스터
      </Link>

      {/* 히어로 */}
      <Card className="gap-0 overflow-hidden p-0">
        {/* 브랜드 밴드 */}
        <div className="bg-brand-gradient h-16 sm:h-20" />
        <CardContent className="px-5 pb-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="-mt-8 flex size-16 shrink-0 items-center justify-center rounded-2xl bg-card text-2xl font-bold shadow-md ring-4 ring-card sm:-mt-10 sm:size-20 sm:text-3xl">
                <span className="text-brand-gradient">{initial}</span>
              </div>
              <div className="min-w-0 pb-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {player.name}
                  </h2>
                  {player.gender ? (
                    <Badge variant="secondary">
                      {GENDER_LABEL[player.gender as Gender]}
                      {player.birth_year ? ` · ${player.birth_year}년생` : ""}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className="font-mono text-muted-foreground"
                    title="선수 고유 ID (모든 대회에서 불변)"
                  >
                    #{player.id}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {regionById.get(player.region_id) ?? ""} ·{" "}
                  {player.affiliation_name}
                </p>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-2">
              <HeroStat label="참가 대회" value={`${participations.length}`} unit="회" />
              <HeroStat
                label="수상"
                value={`${awards.length}`}
                unit="회"
                hint={bestRank ? `최고 ${bestRank}위` : undefined}
              />
              <HeroStat
                label="최고 평균"
                value={bestAvg != null ? bestAvg.toFixed(1) : "–"}
                accent
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {awards.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">수상 이력</CardTitle>
            <div className="flex items-center gap-3 text-sm font-medium tabular-nums">
              {medalCounts[0] > 0 && (
                <span className="flex items-center gap-1.5">
                  <RankMedal rank={1} /> {medalCounts[0]}
                </span>
              )}
              {medalCounts[1] > 0 && (
                <span className="flex items-center gap-1.5">
                  <RankMedal rank={2} /> {medalCounts[1]}
                </span>
              )}
              {medalCounts[2] > 0 && (
                <span className="flex items-center gap-1.5">
                  <RankMedal rank={3} /> {medalCounts[2]}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {awards.map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${podiumRowClass(a.rank)}`}
              >
                <RankMedal rank={a.rank} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.tournamentName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.label}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <PlayerHistory participations={participations} />
    </div>
  );
}

function HeroStat({
  label,
  value,
  unit,
  hint,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3.5 py-2.5 text-center sm:min-w-[5.5rem]">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-xl font-bold tabular-nums leading-tight ${accent ? "text-primary" : ""}`}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function EVENT_TYPE_ORDER_INDEX(t: EventType): number {
  return ["single", "double", "triple", "team5"].indexOf(t);
}
