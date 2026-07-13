import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";

import { Breadcrumb } from "@/components/breadcrumb";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PublicLaneBoard,
  type PublicLane,
} from "@/components/public/lane-board";
import {
  RankingTable,
  type IndividualRow,
  type TeamGroup,
  type TeamRow,
} from "@/components/public/ranking-table";
import {
  categoryFullLabel,
  EVENT_TYPE_LABEL,
} from "@/lib/domain/labels";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
  LineupRole,
  TournamentStatus,
} from "@/lib/supabase/database.types";

export const revalidate = 60;

export default async function PublicRankingPage({
  params,
}: {
  params: Promise<{ id: string; categoryId: string; eventId: string }>;
}) {
  const { id, categoryId, eventId } = await params;
  const tid = Number(id);
  const cid = Number(categoryId);
  const eid = Number(eventId);
  if (![tid, cid, eid].every(Number.isFinite)) notFound();

  const supabase = createPublicClient();

  const { data: event } = await supabase
    .from("tournament_events")
    .select(
      "id, tournament_category_id, event_type, games_count, halftime_split_at, lane_start, lane_end, lane_move_direction, lane_move_offset, squad_count",
    )
    .eq("id", eid)
    .maybeSingle();
  if (!event || event.tournament_category_id !== cid) notFound();

  const { data: category } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id, age, gender, is_active")
    .eq("id", cid)
    .maybeSingle();
  if (!category || category.tournament_id !== tid || !category.is_active) {
    notFound();
  }

  const [{ data: tournament }, { data: withStatus }] = await Promise.all([
    supabase.from("tournaments").select("id, name").eq("id", tid).maybeSingle(),
    supabase
      .from("tournaments_with_status")
      .select("status")
      .eq("id", tid)
      .maybeSingle(),
  ]);
  if (!tournament) notFound();

  const eventType = event.event_type as EventType;
  const status = (withStatus?.status ?? "upcoming") as TournamentStatus;
  const isTeam = eventType !== "single";

  const { data: regions } = await supabase.from("regions").select("id, name");
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  // 마감 게임 (조별) — 조별 마감 집합 + 표시용 합집합
  const squadCount = Math.max(1, event.squad_count);
  const { data: gsRows } = await supabase
    .from("game_states")
    .select("game_number, status, squad_number")
    .eq("tournament_event_id", eid);
  const lockedBySquad = new Map<number, Set<number>>();
  for (const g of gsRows ?? []) {
    if (g.status !== "locked") continue;
    const set = lockedBySquad.get(g.squad_number) ?? new Set<number>();
    set.add(g.game_number);
    lockedBySquad.set(g.squad_number, set);
  }
  const lockedGames = [
    ...new Set([...lockedBySquad.values()].flatMap((s) => [...s])),
  ].sort((a, b) => a - b);

  // 조 멤버십 (분반된 경우) — 선수/팀의 조가 마감한 게임만 노출
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
  const squadLocked = (squad: number, g: number) =>
    lockedBySquad.get(squad)?.has(g) ?? false;

  // 개인 랭킹 캐시
  const { data: rankRows } = await supabase
    .from("rankings")
    .select(
      "tournament_player_id, total, avg, high_game, rank, pin_diff_from_first",
    )
    .eq("tournament_event_id", eid);

  const rankTpIds = (rankRows ?? []).map((r) => r.tournament_player_id);

  // 점수
  const { data: scoreRows } = await supabase
    .from("scores")
    .select("tournament_player_id, game_number, score")
    .eq("tournament_event_id", eid);
  const scoreMap = new Map<string, number>();
  for (const s of scoreRows ?? []) {
    scoreMap.set(`${s.tournament_player_id}:${s.game_number}`, s.score);
  }

  // 팀 데이터 (팀전)
  let teamMetaById = new Map<
    number,
    { region_id: number; affiliation_name: string; team_label: string; team_seq: number }
  >();
  const membersByTeam = new Map<number, number[]>();
  const teamById = new Map<number, number>(); // playerId -> teamId
  // team5 라인업: starter set per (team,game), per (player,game)
  const teamStarters = new Map<string, Set<number>>(); // `${teamId}:${g}` -> starterIds
  const playerStarterByGame = new Map<string, boolean>(); // `${playerId}:${g}`

  if (isTeam) {
    const { data: teamRows } = await supabase
      .from("tournament_teams")
      .select("id, region_id, affiliation_name, team_label, team_seq")
      .eq("tournament_event_id", eid);
    teamMetaById = new Map(
      (teamRows ?? []).map((t) => [
        t.id,
        {
          region_id: t.region_id,
          affiliation_name: t.affiliation_name,
          team_label: t.team_label,
          team_seq: t.team_seq,
        },
      ]),
    );
    const teamIds = (teamRows ?? []).map((t) => t.id);

    const { data: memRows } = teamIds.length
      ? await supabase
          .from("tournament_team_members")
          .select("tournament_team_id, tournament_player_id")
          .in("tournament_team_id", teamIds)
      : { data: [] as {
          tournament_team_id: number;
          tournament_player_id: number;
        }[] };
    for (const m of memRows ?? []) {
      const arr = membersByTeam.get(m.tournament_team_id) ?? [];
      arr.push(m.tournament_player_id);
      membersByTeam.set(m.tournament_team_id, arr);
      teamById.set(m.tournament_player_id, m.tournament_team_id);
    }

    if (eventType === "team5" && teamIds.length) {
      const { data: luRows } = await supabase
        .from("event_lineups")
        .select("tournament_team_id, tournament_player_id, game_number, role")
        .in("tournament_team_id", teamIds);
      for (const lu of luRows ?? []) {
        if ((lu.role as LineupRole) !== "starter") continue;
        const k = `${lu.tournament_team_id}:${lu.game_number}`;
        const set = teamStarters.get(k) ?? new Set<number>();
        set.add(lu.tournament_player_id);
        teamStarters.set(k, set);
        playerStarterByGame.set(
          `${lu.tournament_player_id}:${lu.game_number}`,
          true,
        );
      }
    }
  }

  // 레인 데이터 (진행중일 때만)
  const assignedTpIds: number[] = [];
  type LaRow = {
    id: number;
    base_lane: number;
    tournament_team_id: number | null;
    squad_number: number;
    is_makeup: boolean;
  };
  let laList: LaRow[] = [];
  let lapList: { lane_assignment_id: number; tournament_player_id: number }[] = [];
  if (status === "ongoing" && event.lane_start != null) {
    const { data: laRows } = await supabase
      .from("lane_assignments")
      .select("id, base_lane, tournament_team_id, squad_number, is_makeup")
      .eq("tournament_event_id", eid)
      .order("base_lane");
    laList = laRows ?? [];
    const laIds = laList.map((l) => l.id);
    // 공개 레인보드는 전반/기본(half=0) 배치만 표시 (후반 오버라이드 제외)
    const { data: lapRows } = laIds.length
      ? await supabase
          .from("lane_assignment_players")
          .select("lane_assignment_id, tournament_player_id")
          .in("lane_assignment_id", laIds)
          .eq("half", 0)
      : { data: [] as {
          lane_assignment_id: number;
          tournament_player_id: number;
        }[] };
    lapList = lapRows ?? [];
    for (const lap of lapList) assignedTpIds.push(lap.tournament_player_id);
  }

  // 참가 선수명 (랭킹 + 멤버 + 레인 배정 모두 포함)
  const allTpIds = [
    ...new Set([
      ...rankTpIds,
      ...assignedTpIds,
      ...[...membersByTeam.values()].flat(),
    ]),
  ];
  const { data: nameRows } = allTpIds.length
    ? await supabase
        .from("participant_names")
        .select("tournament_player_id, name")
        .in("tournament_player_id", allTpIds)
    : { data: [] as { tournament_player_id: number; name: string }[] };
  const nameById = new Map(
    (nameRows ?? []).map((n) => [n.tournament_player_id, n.name]),
  );

  // tp 메타 (시군/소속/번호/팀라벨)
  const { data: tpRows } = allTpIds.length
    ? await supabase
        .from("tournament_players")
        .select("id, region_id, affiliation_name, player_number, team_label")
        .in("id", allTpIds)
    : { data: [] as {
        id: number;
        region_id: number;
        affiliation_name: string;
        player_number: number;
        team_label: string;
      }[] };
  const tpById = new Map((tpRows ?? []).map((r) => [r.id, r]));

  // 개인 행
  const individualRows: IndividualRow[] = (rankRows ?? [])
    .map((r) => {
      const tp = tpById.get(r.tournament_player_id);
      const games: Record<number, number> = {};
      const starterByGame: Record<number, boolean> = {};
      const pSquad = playerSquad(r.tournament_player_id);
      for (const g of lockedGames) {
        if (!squadLocked(pSquad, g)) continue;
        const s = scoreMap.get(`${r.tournament_player_id}:${g}`);
        if (s != null) games[g] = s;
        if (eventType === "team5") {
          starterByGame[g] =
            playerStarterByGame.get(`${r.tournament_player_id}:${g}`) ?? false;
        }
      }
      return {
        tournamentPlayerId: r.tournament_player_id,
        rank: r.rank,
        regionName: regionById.get(tp?.region_id ?? -1) ?? "",
        affiliationName: tp?.affiliation_name ?? "",
        playerNumber: tp?.player_number ?? 0,
        teamLabel: tp?.team_label ?? "",
        name: nameById.get(r.tournament_player_id) ?? "",
        total: r.total,
        avg: r.avg == null ? null : Number(r.avg),
        pinDiff: r.pin_diff_from_first,
        games,
        starterByGame: eventType === "team5" ? starterByGame : undefined,
      };
    })
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));

  // 팀 행
  let teamRows: TeamRow[] = [];
  if (isTeam) {
    const { data: trRows } = await supabase
      .from("team_rankings")
      .select(
        "tournament_team_id, total, avg, high_game, rank, pin_diff_from_first",
      )
      .eq("tournament_event_id", eid);
    teamRows = (trRows ?? [])
      .map((r) => {
        const meta = teamMetaById.get(r.tournament_team_id);
        const memberIds = membersByTeam.get(r.tournament_team_id) ?? [];
        const tSquad = memberIds.length ? playerSquad(memberIds[0]) : 1;
        const games: Record<number, number> = {};
        for (const g of lockedGames) {
          if (!squadLocked(tSquad, g)) continue;
          const contributors =
            eventType === "team5"
              ? [
                  ...(teamStarters.get(`${r.tournament_team_id}:${g}`) ??
                    new Set<number>()),
                ]
              : memberIds;
          let sum = 0;
          let any = false;
          for (const pid of contributors) {
            const s = scoreMap.get(`${pid}:${g}`);
            if (s != null) {
              sum += s;
              any = true;
            }
          }
          if (any) games[g] = sum;
        }
        return {
          teamId: r.tournament_team_id,
          rank: r.rank,
          regionName: regionById.get(meta?.region_id ?? -1) ?? "",
          affiliationName: meta?.affiliation_name ?? "",
          teamLabel: `${meta?.team_label ?? ""}${
            meta && meta.team_seq > 1 ? `-${meta.team_seq}` : ""
          }`,
          total: r.total,
          avg: r.avg == null ? null : Number(r.avg),
          pinDiff: r.pin_diff_from_first,
          games,
        };
      })
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  }

  // 팀 묶음 (멤버 개인점수 + 팀 합계) — 팀 순위 기준
  let teamGroups: TeamGroup[] = [];
  if (isTeam) {
    teamGroups = teamRows.map((tr) => {
      const memberIds = membersByTeam.get(tr.teamId) ?? [];
      const members = memberIds
        .map((mid) => {
          const mSquad = playerSquad(mid);
          const games: Record<number, number> = {};
          const starterByGame: Record<number, boolean> = {};
          for (const g of lockedGames) {
            if (!squadLocked(mSquad, g)) continue;
            const s = scoreMap.get(`${mid}:${g}`);
            if (s != null) games[g] = s;
            if (eventType === "team5") {
              starterByGame[g] =
                playerStarterByGame.get(`${mid}:${g}`) ?? false;
            }
          }
          return {
            tournamentPlayerId: mid,
            playerNumber: tpById.get(mid)?.player_number ?? 0,
            name: nameById.get(mid) ?? "",
            games,
            starterByGame: eventType === "team5" ? starterByGame : undefined,
          };
        })
        .sort((a, b) => a.playerNumber - b.playerNumber);
      return {
        teamId: tr.teamId,
        rank: tr.rank,
        regionName: tr.regionName,
        affiliationName: tr.affiliationName,
        teamLabel: tr.teamLabel,
        members,
        teamGames: tr.games,
        total: tr.total,
        avg: tr.avg,
        pinDiff: tr.pinDiff,
      };
    });
  }

  // 팀 멤버 치는 순서 (member_order) — 레인 내 정렬용
  const { data: ttmOrderRows } = await supabase
    .from("tournament_team_members")
    .select("tournament_player_id, member_order")
    .eq("tournament_event_id", eid);
  const memberOrderByPlayer = new Map(
    (ttmOrderRows ?? []).map((m) => [m.tournament_player_id, m.member_order]),
  );

  // 레인 보드 구성 (조별)
  const publicLanesBySquad = new Map<number, PublicLane[]>();
  if (laList.length > 0) {
    const playersByLa = new Map<number, number[]>();
    for (const lap of lapList) {
      const arr = playersByLa.get(lap.lane_assignment_id) ?? [];
      arr.push(lap.tournament_player_id);
      playersByLa.set(lap.lane_assignment_id, arr);
    }
    const bySquad = new Map<number, Map<number, PublicLane>>();
    const ensureLane = (squad: number, lane: number) => {
      let laneMap = bySquad.get(squad);
      if (!laneMap) {
        laneMap = new Map();
        bySquad.set(squad, laneMap);
      }
      let v = laneMap.get(lane);
      if (!v) {
        v = { lane, teams: [], individuals: [], isMakeup: false };
        laneMap.set(lane, v);
      }
      return v;
    };
    for (const la of laList) {
      const lane = ensureLane(la.squad_number, la.base_lane);
      const pids = playersByLa.get(la.id) ?? [];
      const names = pids
        .map((pid) => ({ pid, name: nameById.get(pid) ?? "" }))
        .sort((a, b) => {
          const oa = memberOrderByPlayer.get(a.pid) ?? Number.MAX_SAFE_INTEGER;
          const ob = memberOrderByPlayer.get(b.pid) ?? Number.MAX_SAFE_INTEGER;
          return (
            oa - ob ||
            (tpById.get(a.pid)?.player_number ?? 0) -
              (tpById.get(b.pid)?.player_number ?? 0)
          );
        })
        .map((x) => x.name);
      if (la.tournament_team_id != null) {
        const meta = teamMetaById.get(la.tournament_team_id);
        lane.teams.push({
          label: `${meta?.affiliation_name ?? ""} ${meta?.team_label ?? ""}`,
          members: names,
        });
      } else {
        if (la.is_makeup) lane.isMakeup = true;
        lane.individuals.push(...names);
      }
    }
    for (const [squad, laneMap] of bySquad) {
      publicLanesBySquad.set(
        squad,
        [...laneMap.values()].sort((a, b) => a.lane - b.lane),
      );
    }
  }

  const regionsPresent = [
    ...new Set([
      ...individualRows.map((r) => r.regionName),
      ...teamRows.map((r) => r.regionName),
    ]),
  ].filter(Boolean);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/[0.04] to-transparent">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-start justify-between gap-2">
          <Breadcrumb
            items={[
              { label: "대회 목록", href: "/" },
              { label: tournament.name, href: `/tournaments/${tid}` },
              {
                label: categoryFullLabel(
                  category.age as CategoryAge,
                  category.gender as Gender,
                ),
                href: `/tournaments/${tid}/${cid}`,
              },
              { label: EVENT_TYPE_LABEL[eventType] },
            ]}
          />
          <Link
            href={`/tournaments/${tid}/${cid}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <Trophy className="h-4 w-4 text-primary" />
            종별 순위
          </Link>
        </div>
        <h1 className="mt-3 mb-1 text-2xl font-bold tracking-tight">
          {EVENT_TYPE_LABEL[eventType]} 순위
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">{tournament.name}</p>

        <RankingTable
          eventId={eid}
          eventType={eventType}
          gamesCount={event.games_count}
          lockedGames={lockedGames}
          individualRows={individualRows}
          teamGroups={teamGroups}
          regionsPresent={regionsPresent}
        />

        {status === "ongoing" &&
        event.lane_start != null &&
        event.lane_end != null
          ? Array.from({ length: squadCount }, (_, i) => i + 1).map((sq) => (
              <Card className="mt-6" key={sq}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {squadCount > 1 ? `${sq}조 배정 레인` : "배정 레인"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PublicLaneBoard
                    lanes={publicLanesBySquad.get(sq) ?? []}
                    laneStart={event.lane_start!}
                    laneEnd={event.lane_end!}
                    direction={event.lane_move_direction as LaneMoveDirection}
                    offset={event.lane_move_offset}
                    gamesCount={event.games_count}
                  />
                </CardContent>
              </Card>
            ))
          : null}
      </div>
    </div>
  );
}
