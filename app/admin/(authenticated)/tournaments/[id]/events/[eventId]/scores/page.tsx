import Link from "next/link";
import { notFound } from "next/navigation";
import { Grid2x2 } from "lucide-react";

import { Breadcrumb } from "@/components/breadcrumb";
import { RankingMenu } from "@/components/admin/ranking-menu";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  categoryFullLabel,
  EVENT_TYPE_LABEL,
} from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
} from "@/lib/supabase/database.types";

import { ScoreBoard, type LaneScores } from "./score-board";

export const dynamic = "force-dynamic";

export default async function ScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; eventId: string }>;
  searchParams: Promise<{ squad?: string }>;
}) {
  const { id, eventId } = await params;
  const { squad: squadParam } = await searchParams;
  const tid = Number(id);
  const eid = Number(eventId);
  if (!Number.isFinite(tid) || !Number.isFinite(eid)) notFound();

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("tournament_events")
    .select(
      "id, tournament_category_id, event_type, games_count, halftime_split_at, lane_start, lane_end, lane_move_direction, lane_move_offset, squad_count",
    )
    .eq("id", eid)
    .maybeSingle();
  if (!event) notFound();

  const { data: category } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id, age, gender")
    .eq("id", event.tournament_category_id)
    .maybeSingle();
  if (!category || category.tournament_id !== tid) notFound();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) notFound();

  // 현재 사용자 권한 (마감 해제는 super_admin)
  const { data: auth } = await supabase.auth.getUser();
  let isSuperAdmin = false;
  if (auth.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    isSuperAdmin = profile?.role === "super_admin";
  }

  const eventType = event.event_type as EventType;
  const squadCount = Math.max(1, event.squad_count);
  const selectedSquad = Math.min(
    Math.max(1, Number(squadParam) || 1),
    squadCount,
  );
  const headerLabel = `${categoryFullLabel(
    category.age as CategoryAge,
    category.gender as Gender,
  )} · ${EVENT_TYPE_LABEL[eventType]}`;

  const header = (
    <div className="flex flex-col gap-3">
      <Breadcrumb
        items={[
          { label: "대회 목록", href: "/admin/tournaments" },
          { label: tournament.name, href: `/admin/tournaments/${tid}` },
          { label: "점수 입력" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">점수 입력</h2>
          <p className="text-sm text-muted-foreground">{headerLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link
            href={`/admin/tournaments/${tid}/events/${eid}/lanes`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Grid2x2 data-icon="inline-start" />레인 배정
          </Link>
          <RankingMenu
            overallHref={`/admin/tournaments/${tid}/rankings`}
            eventHref={`/tournaments/${tid}/${category.id}/${eid}`}
          />
        </div>
      </div>
    </div>
  );

  // 레인 배정 → 채점 대상 (선택 조만)
  const { data: laRows } = await supabase
    .from("lane_assignments")
    .select("id, base_lane, tournament_team_id")
    .eq("tournament_event_id", eid)
    .eq("squad_number", selectedSquad)
    .order("base_lane");
  const laList = laRows ?? [];

  if (laList.length === 0) {
    return (
      <div className="grid max-w-3xl gap-6">
        {header}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            먼저 레인 배정을 완료해주세요. 배정된 선수만 점수를 입력할 수
            있습니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  const laIds = laList.map((l) => l.id);
  // id 오름차순 = 레인배정에서 입력한 치는 순서 (저장 시 그 순서로 삽입됨)
  const { data: lapRows } = await supabase
    .from("lane_assignment_players")
    .select("id, lane_assignment_id, tournament_player_id, half")
    .in("lane_assignment_id", laIds)
    .order("id");

  const laById = new Map(laList.map((l) => [l.id, l]));

  // 참가 선수 메타
  const playerTpIds = [
    ...new Set((lapRows ?? []).map((r) => r.tournament_player_id)),
  ];
  const { data: tpRows } = playerTpIds.length
    ? await supabase
        .from("tournament_players")
        .select("id, player_id, player_number, affiliation_name, team_label")
        .in("id", playerTpIds)
    : { data: [] as {
        id: number;
        player_id: number;
        player_number: number;
        affiliation_name: string;
        team_label: string;
      }[] };
  const tpById = new Map((tpRows ?? []).map((r) => [r.id, r]));
  const masterIds = [...new Set((tpRows ?? []).map((r) => r.player_id))];
  const { data: playerRows } = masterIds.length
    ? await supabase.from("players").select("id, name").in("id", masterIds)
    : { data: [] as { id: number; name: string }[] };
  const nameById = new Map((playerRows ?? []).map((p) => [p.id, p.name]));

  // 팀 멤버 치는 순서 (member_order). 개인/메이크업은 없음 → lap 삽입순(입력순)으로 폴백
  const { data: ttmOrderRows } = await supabase
    .from("tournament_team_members")
    .select("tournament_player_id, member_order")
    .eq("tournament_event_id", eid);
  const memberOrderByPlayer = new Map(
    (ttmOrderRows ?? []).map((m) => [m.tournament_player_id, m.member_order]),
  );

  // 레인별 선수 묶기 (전반/기본 = half=0 기준). lapRows 가 id순이라 push 순서 = 입력 순서
  const laneMap = new Map<
    number,
    { id: number; playerNumber: number; name: string; affiliationName: string; teamLabel: string; teamId: number | null }[]
  >();
  // 후반 오버라이드: playerId → 후반 base_lane (half=2)
  // 후반 타순: half=2 행을 lap.id(=삽입 순서) 순으로 본 등장 순서
  const secondHalfBaseByPlayer: Record<number, number> = {};
  const secondHalfOrderByPlayer: Record<number, number> = {};
  let secondOrderSeq = 0;
  for (const lap of lapRows ?? []) {
    const la = laById.get(lap.lane_assignment_id);
    if (!la) continue;
    const tp = tpById.get(lap.tournament_player_id);
    if (!tp) continue;
    if (lap.half === 2) {
      secondHalfBaseByPlayer[tp.id] = la.base_lane;
      if (secondHalfOrderByPlayer[tp.id] == null)
        secondHalfOrderByPlayer[tp.id] = secondOrderSeq++;
      continue;
    }
    const arr = laneMap.get(la.base_lane) ?? [];
    arr.push({
      id: tp.id,
      playerNumber: tp.player_number,
      name: nameById.get(tp.player_id) ?? "",
      affiliationName: tp.affiliation_name,
      teamLabel: tp.team_label,
      teamId: la.tournament_team_id,
    });
    laneMap.set(la.base_lane, arr);
  }
  const lanes: LaneScores[] = [...laneMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lane, players]) => ({
      lane,
      // member_order 우선(팀), 동순위는 lap 삽입순 유지(안정 정렬) → 개인/메이크업은 입력순
      players: players
        .slice()
        .sort(
          (a, b) =>
            (memberOrderByPlayer.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (memberOrderByPlayer.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
    }));

  // 점수
  const { data: scoreRows } = await supabase
    .from("scores")
    .select("tournament_player_id, game_number, score")
    .eq("tournament_event_id", eid);
  const scores: Record<string, number> = {};
  for (const s of scoreRows ?? []) {
    scores[`${s.tournament_player_id}:${s.game_number}`] = s.score;
  }

  // 게임 마감 상태 (선택 조만)
  const { data: gsRows } = await supabase
    .from("game_states")
    .select("game_number, status")
    .eq("tournament_event_id", eid)
    .eq("squad_number", selectedSquad);
  const lockedGames = (gsRows ?? [])
    .filter((g) => g.status === "locked")
    .map((g) => g.game_number);

  return (
    <div className="grid max-w-6xl gap-6">
      {header}
      {squadCount > 1 ? (
        <div className="inline-flex w-fit gap-1 rounded-md border p-0.5">
          {Array.from({ length: squadCount }, (_, i) => i + 1).map((sq) => (
            <Link
              key={sq}
              href={`/admin/tournaments/${tid}/events/${eid}/scores?squad=${sq}`}
              aria-current={sq === selectedSquad ? "page" : undefined}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                sq === selectedSquad
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {sq}조
            </Link>
          ))}
        </div>
      ) : null}
      <ScoreBoard
        key={selectedSquad}
        tournamentId={tid}
        eventId={eid}
        squadNumber={selectedSquad}
        gamesCount={event.games_count}
        halftimeSplitAt={event.halftime_split_at}
        isSuperAdmin={isSuperAdmin}
        lanes={lanes}
        secondHalfBaseByPlayer={secondHalfBaseByPlayer}
        secondHalfOrderByPlayer={secondHalfOrderByPlayer}
        laneStart={event.lane_start}
        laneEnd={event.lane_end}
        direction={event.lane_move_direction as LaneMoveDirection}
        offset={event.lane_move_offset}
        initialScores={scores}
        lockedGames={lockedGames}
      />
    </div>
  );
}
