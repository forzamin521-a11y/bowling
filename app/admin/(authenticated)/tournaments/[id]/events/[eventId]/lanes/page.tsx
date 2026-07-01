import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Users } from "lucide-react";

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

import { LaneBoard, type BoardPlayer } from "./lane-board";

export const dynamic = "force-dynamic";

export default async function LanesPage({
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
    .select("id, name, settings")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) notFound();

  const eventType = event.event_type as EventType;
  const settings = (tournament.settings ?? {}) as { max_per_lane?: number };
  const maxPerLane = settings.max_per_lane ?? 6;
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
          { label: "레인 배정" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            레인 배정 · 팀 편성
          </h2>
          <p className="text-sm text-muted-foreground">{headerLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link
            href={`/admin/tournaments/${tid}/events/${eid}/squads`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Users data-icon="inline-start" />조 편성
          </Link>
          <Link
            href={`/admin/tournaments/${tid}/events/${eid}/scores${
              squadCount > 1 ? `?squad=${selectedSquad}` : ""
            }`}
            className={cn(buttonVariants())}
          >
            <ClipboardList data-icon="inline-start" />점수 입력
          </Link>
          <RankingMenu
            overallHref={`/admin/tournaments/${tid}/rankings`}
            eventHref={`/tournaments/${tid}/${category.id}/${eid}`}
          />
        </div>
      </div>
    </div>
  );

  if (event.lane_start == null || event.lane_end == null) {
    return (
      <div className="grid max-w-3xl gap-6">
        {header}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            이 세부종목에 사용 레인이 설정되지 않았습니다. 대회 상세에서 세부종목
            사용 레인을 먼저 지정하세요.
          </CardContent>
        </Card>
      </div>
    );
  }

  // 참가 선수 + 이름/시군
  const [{ data: tpRows }, { data: regions }] = await Promise.all([
    supabase
      .from("tournament_players")
      .select(
        "id, player_id, player_number, region_id, affiliation_name, team_label",
      )
      .eq("tournament_id", tid)
      .order("player_number"),
    supabase.from("regions").select("id, name"),
  ]);
  const rows = tpRows ?? [];
  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("players").select("id, name").in("id", playerIds)
    : { data: [] as { id: number; name: string }[] };
  const nameById = new Map((playerRows ?? []).map((p) => [p.id, p.name]));
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  // 조 멤버십 (분반된 경우 선택 조 선수만)
  const { data: esmRows } =
    squadCount > 1
      ? await supabase
          .from("event_squad_members")
          .select("tournament_player_id, squad_number")
          .eq("tournament_event_id", eid)
      : { data: [] as { tournament_player_id: number; squad_number: number }[] };
  const squadOfPlayer = new Map(
    (esmRows ?? []).map((r) => [r.tournament_player_id, r.squad_number]),
  );
  const playerSquad = (pid: number) => squadOfPlayer.get(pid) ?? 1;

  const players: BoardPlayer[] = rows
    .filter((r) => squadCount === 1 || playerSquad(r.id) === selectedSquad)
    .map((r) => ({
      id: r.id,
      playerNumber: r.player_number,
      name: nameById.get(r.player_id) ?? "",
      regionId: r.region_id,
      regionName: regionById.get(r.region_id) ?? "",
      affiliationName: r.affiliation_name,
      teamLabel: r.team_label,
    }));

  // 기존 배정 → 초기 배치 (선택 조)
  const { data: laRows } = await supabase
    .from("lane_assignments")
    .select("id, base_lane")
    .eq("tournament_event_id", eid)
    .eq("squad_number", selectedSquad);
  const laList = laRows ?? [];
  const laIds = laList.map((l) => l.id);
  const baseLaneByLa = new Map(laList.map((l) => [l.id, l.base_lane]));
  const { data: lapRows } = laIds.length
    ? await supabase
        .from("lane_assignment_players")
        .select("id, lane_assignment_id, tournament_player_id, half")
        .in("lane_assignment_id", laIds)
    : { data: [] as {
        id: number;
        lane_assignment_id: number;
        tournament_player_id: number;
        half: number;
      }[] };

  // 치는 순서(member_order) 복원용
  const { data: ttmRows } = await supabase
    .from("tournament_team_members")
    .select("tournament_player_id, member_order")
    .eq("tournament_event_id", eid);
  const orderByPlayer = new Map(
    (ttmRows ?? []).map((m) => [m.tournament_player_id, m.member_order]),
  );

  const playerIdSet = new Set(players.map((p) => p.id));
  // 전반(half=0) 레인별 선수 — member_order → lap.id 순으로 정렬해 입력 순서 복원
  const half0 = (lapRows ?? [])
    .filter((l) => l.half === 0 && playerIdSet.has(l.tournament_player_id))
    .map((l) => ({
      pid: l.tournament_player_id,
      lane: baseLaneByLa.get(l.lane_assignment_id),
      lapId: l.id,
    }))
    .filter((x): x is { pid: number; lane: number; lapId: number } => x.lane != null);
  half0.sort((a, b) => {
    const oa = orderByPlayer.get(a.pid) ?? Number.MAX_SAFE_INTEGER;
    const ob = orderByPlayer.get(b.pid) ?? Number.MAX_SAFE_INTEGER;
    return oa - ob || a.lapId - b.lapId;
  });
  const initialLaneLists: Record<number, number[]> = {};
  for (const x of half0) {
    (initialLaneLists[x.lane] ??= []).push(x.pid);
  }

  const initialSecondHalfLaneOf: Record<number, number> = {};
  // 후반 타순 복원: half=2 행을 lap.id(=저장 시 삽입 순서, 곧 타순)로 정렬해 레인별로 묶음
  const half2 = (lapRows ?? [])
    .filter((l) => l.half === 2 && playerIdSet.has(l.tournament_player_id))
    .map((l) => ({
      pid: l.tournament_player_id,
      lane: baseLaneByLa.get(l.lane_assignment_id),
      lapId: l.id,
    }))
    .filter((x): x is { pid: number; lane: number; lapId: number } => x.lane != null)
    .sort((a, b) => a.lapId - b.lapId);
  const initialSecondOrder: Record<number, number[]> = {};
  for (const x of half2) {
    initialSecondHalfLaneOf[x.pid] = x.lane;
    (initialSecondOrder[x.lane] ??= []).push(x.pid);
  }

  return (
    <div className="grid max-w-6xl gap-6">
      {header}
      {squadCount > 1 ? (
        <SquadTabs
          squadCount={squadCount}
          selected={selectedSquad}
          baseHref={`/admin/tournaments/${tid}/events/${eid}/lanes`}
        />
      ) : null}
      <LaneBoard
        key={selectedSquad}
        tournamentId={tid}
        eventId={eid}
        squadNumber={selectedSquad}
        eventType={eventType}
        laneStart={event.lane_start}
        laneEnd={event.lane_end}
        direction={event.lane_move_direction as LaneMoveDirection}
        offset={event.lane_move_offset}
        gamesCount={event.games_count}
        halftimeSplitAt={event.halftime_split_at}
        maxPerLane={maxPerLane}
        players={players}
        initialLaneLists={initialLaneLists}
        initialSecondHalfLaneOf={initialSecondHalfLaneOf}
        initialSecondOrder={initialSecondOrder}
      />
    </div>
  );
}

function SquadTabs({
  squadCount,
  selected,
  baseHref,
}: {
  squadCount: number;
  selected: number;
  baseHref: string;
}) {
  return (
    <div className="inline-flex w-fit gap-1 rounded-md border p-0.5">
      {Array.from({ length: squadCount }, (_, i) => i + 1).map((sq) => (
        <Link
          key={sq}
          href={`${baseHref}?squad=${sq}`}
          aria-current={sq === selected ? "page" : undefined}
          className={cn(
            "rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            sq === selected
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent",
          )}
        >
          {sq}조
        </Link>
      ))}
    </div>
  );
}
