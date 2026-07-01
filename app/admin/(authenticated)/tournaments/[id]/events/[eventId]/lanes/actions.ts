"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { classifyLane, groupKey, teamSize } from "@/lib/domain/team-from-lane";
import { createClient } from "@/lib/supabase/server";
import type { Database, EventType } from "@/lib/supabase/database.types";

export type LaneActionResult = { error?: string; message?: string };

type Client = Awaited<ReturnType<typeof createClient>>;
type LapInsert =
  Database["public"]["Tables"]["lane_assignment_players"]["Insert"];
type LineupInsert = Database["public"]["Tables"]["event_lineups"]["Insert"];

const placementSchema = z.object({
  playerId: z.coerce.number().int().positive(),
  lane: z.coerce.number().int().positive(),
});

// 레인별 선수 배열은 입력/배치 순서를 그대로 담는다 (= 치는 순서 member_order).
const laneSchema = z.object({
  baseLane: z.coerce.number().int().positive(),
  playerIds: z.array(z.coerce.number().int().positive()),
});

const saveSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
  squadNumber: z.coerce.number().int().min(1).max(8),
  lanes: z.array(laneSchema),
  secondHalf: z.array(placementSchema).optional(),
});

async function loadEvent(supabase: Client, tournamentId: number, eventId: number) {
  const { data: event } = await supabase
    .from("tournament_events")
    .select(
      "id, tournament_category_id, event_type, games_count, halftime_split_at, lane_start, lane_end, squad_count",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "세부종목을 찾을 수 없습니다." as const };

  const { data: category } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id")
    .eq("id", event.tournament_category_id)
    .maybeSingle();
  if (!category || category.tournament_id !== tournamentId) {
    return { error: "대회 정보가 일치하지 않습니다." as const };
  }
  return { event };
}

/** 이 조에 속한 (기존) 팀 + 잔여 레인배정을 모두 삭제. 팀 종목은 종목 전체 팀 중 조가 일치하는 팀만. */
async function clearSquad(
  supabase: Client,
  eventId: number,
  squadNumber: number,
  squadCount: number,
) {
  // 조별 선수 매핑
  const squadOfPlayer = new Map<number, number>();
  if (squadCount > 1) {
    const { data: esm } = await supabase
      .from("event_squad_members")
      .select("tournament_player_id, squad_number")
      .eq("tournament_event_id", eventId);
    for (const r of esm ?? [])
      squadOfPlayer.set(r.tournament_player_id, r.squad_number);
  }
  const playerSquad = (pid: number) => squadOfPlayer.get(pid) ?? 1;

  const { data: teamRows } = await supabase
    .from("tournament_teams")
    .select("id")
    .eq("tournament_event_id", eventId);
  const allTeamIds = (teamRows ?? []).map((t) => t.id);
  if (allTeamIds.length) {
    const { data: mem } = await supabase
      .from("tournament_team_members")
      .select("tournament_team_id, tournament_player_id")
      .in("tournament_team_id", allTeamIds);
    const firstMemberOf = new Map<number, number>();
    for (const m of mem ?? []) {
      if (!firstMemberOf.has(m.tournament_team_id))
        firstMemberOf.set(m.tournament_team_id, m.tournament_player_id);
    }
    const toDelete = allTeamIds.filter((tid) => {
      const fm = firstMemberOf.get(tid);
      const sq = fm != null ? playerSquad(fm) : 1;
      return sq === squadNumber;
    });
    if (toDelete.length) {
      // tournament_teams 삭제 → 멤버·라인업·team_rankings·lane_assignments(+players) CASCADE
      const { error } = await supabase
        .from("tournament_teams")
        .delete()
        .in("id", toDelete);
      if (error) return error.message;
    }
  }
  // 남은 NULL팀(개인/메이크업) 레인 삭제
  const { error: delErr } = await supabase
    .from("lane_assignments")
    .delete()
    .eq("tournament_event_id", eventId)
    .eq("squad_number", squadNumber);
  if (delErr) return delErr.message;
  return null;
}

export async function saveLaneAssignment(input: {
  tournamentId: number;
  eventId: number;
  squadNumber: number;
  lanes: { baseLane: number; playerIds: number[] }[];
  secondHalf?: { playerId: number; lane: number }[];
}): Promise<LaneActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인해주세요." };

  const {
    tournamentId,
    eventId,
    squadNumber,
    lanes: laneInput,
    secondHalf,
  } = parsed.data;
  // 레인 배열을 평면 placements 로 (순서 보존)
  const placements = laneInput.flatMap((l) =>
    l.playerIds.map((playerId) => ({ playerId, lane: l.baseLane })),
  );
  const supabase = await createClient();

  const v = await loadEvent(supabase, tournamentId, eventId);
  if ("error" in v) return { error: v.error };
  const { event } = v;
  const eventType = event.event_type as EventType;
  const squadCount = Math.max(1, event.squad_count);

  if (event.lane_start == null || event.lane_end == null) {
    return { error: "세부종목에 사용 레인이 설정되지 않았습니다." };
  }
  const inRange = (lane: number) =>
    lane >= event.lane_start! && lane <= event.lane_end!;
  if (placements.some((p) => !inRange(p.lane))) {
    return { error: "사용 레인 범위를 벗어난 배정이 있습니다." };
  }

  // 한 선수는 한 레인만
  const seen = new Set<number>();
  for (const p of placements) {
    if (seen.has(p.playerId))
      return { error: "한 선수가 여러 레인에 배정되었습니다." };
    seen.add(p.playerId);
  }

  // 참가 선수 메타
  const pids = placements.map((p) => p.playerId);
  const { data: tpRows } = pids.length
    ? await supabase
        .from("tournament_players")
        .select(
          "id, tournament_id, region_id, affiliation_name, team_label, player_number",
        )
        .in("id", pids)
    : { data: [] as {
        id: number;
        tournament_id: number;
        region_id: number;
        affiliation_name: string;
        team_label: string;
        player_number: number;
      }[] };
  const tpById = new Map((tpRows ?? []).map((r) => [r.id, r]));
  if (pids.some((id) => !tpById.has(id)))
    return { error: "존재하지 않는 선수가 포함되어 있습니다." };
  if ((tpRows ?? []).some((r) => r.tournament_id !== tournamentId))
    return { error: "다른 대회의 선수가 포함되어 있습니다." };

  const info = (pid: number) => {
    const r = tpById.get(pid)!;
    return {
      regionId: r.region_id,
      affiliationName: r.affiliation_name,
      teamLabel: r.team_label,
    };
  };

  // 기존 이 조 데이터 정리
  const clearErr = await clearSquad(supabase, eventId, squadNumber, squadCount);
  if (clearErr) return { error: clearErr };

  // 레인별 그룹화 (입력 순서 보존 = 치는 순서)
  const byLane = new Map<number, number[]>();
  for (const l of laneInput) {
    const arr = byLane.get(l.baseLane) ?? [];
    arr.push(...l.playerIds);
    byLane.set(l.baseLane, arr);
  }
  const lanesAsc = [...byLane.keys()].sort((a, b) => a - b);

  // 기존(다른 조 포함) 팀의 그룹별 최대 team_seq 로 시작값 계산
  const { data: existTeams } = await supabase
    .from("tournament_teams")
    .select("region_id, affiliation_name, team_label, team_seq")
    .eq("tournament_event_id", eventId);
  const seqByGroup = new Map<string, number>();
  for (const t of existTeams ?? []) {
    const k = groupKey({
      regionId: t.region_id,
      affiliationName: t.affiliation_name,
      teamLabel: t.team_label,
    });
    seqByGroup.set(k, Math.max(seqByGroup.get(k) ?? 0, t.team_seq));
  }

  const laByBaseLane = new Map<number, number>();
  // team5 팀 정보 (벤치 연결·후반 처리용)
  const team5Teams: {
    teamId: number;
    baseLane: number;
    gkey: string;
    starters1: number[];
  }[] = [];

  async function insertLane(
    baseLane: number,
    teamId: number | null,
    isMakeup: boolean,
    playerIds: number[],
  ) {
    const { data: la, error } = await supabase
      .from("lane_assignments")
      .insert({
        tournament_event_id: eventId,
        base_lane: baseLane,
        tournament_team_id: teamId,
        squad_number: squadNumber,
        is_makeup: isMakeup,
      })
      .select("id")
      .single();
    if (error || !la) return { error: error?.message ?? "레인 배정 실패" };
    laByBaseLane.set(baseLane, la.id);
    if (playerIds.length) {
      const rows: LapInsert[] = playerIds.map((pid) => ({
        lane_assignment_id: la.id,
        tournament_player_id: pid,
      }));
      const { error: lapErr } = await supabase
        .from("lane_assignment_players")
        .insert(rows);
      if (lapErr) return { error: lapErr.message };
    }
    return { laId: la.id };
  }

  for (const lane of lanesAsc) {
    const playerIds = byLane.get(lane)!;
    const cls = classifyLane(playerIds.map(info), eventType);

    if (cls.kind === "team" && cls.group) {
      const k = groupKey(cls.group);
      const nextSeq = (seqByGroup.get(k) ?? 0) + 1;
      seqByGroup.set(k, nextSeq);
      const { data: team, error: teamErr } = await supabase
        .from("tournament_teams")
        .insert({
          tournament_event_id: eventId,
          region_id: cls.group.regionId,
          affiliation_name: cls.group.affiliationName,
          team_label: cls.group.teamLabel,
          team_seq: nextSeq,
        })
        .select("id")
        .single();
      if (teamErr || !team)
        return { error: teamErr?.message ?? "팀 생성 실패" };

      // 레인 배정 + 레인 선수 (team5는 스타터 5명, 그 외는 전원)
      const r = await insertLane(lane, team.id, false, playerIds);
      if ("error" in r) return r;

      if (eventType === "team5") {
        team5Teams.push({
          teamId: team.id,
          baseLane: lane,
          gkey: k,
          starters1: [...playerIds],
        });
        // 멤버/라인업은 벤치 연결 후 일괄 처리
      } else {
        // double/triple: 멤버 = 레인 선수, member_order = 입력 순서(치는 순서)
        const memRows = playerIds.map((pid, i) => ({
          tournament_team_id: team.id,
          tournament_player_id: pid,
          member_order: i + 1,
        }));
        const { error: memErr } = await supabase
          .from("tournament_team_members")
          .insert(memRows);
        if (memErr) return { error: memErr.message };
      }
    } else {
      // makeup(혼합) 또는 single 개인 레인
      const isMakeup = cls.kind === "makeup";
      const r = await insertLane(lane, null, isMakeup, playerIds);
      if ("error" in r) return r;
    }
  }

  // ── team5: 벤치 연결 + 게임별 라인업 + 후반 오버라이드 ──
  if (eventType === "team5" && team5Teams.length) {
    // 이 조의 같은 그룹 6번째(벤치) 후보: placements 중 같은 gkey 이면서 스타터에 없는 선수
    const placedByGroup = new Map<string, number[]>();
    for (const p of placements) {
      const k = groupKey(info(p.playerId));
      const arr = placedByGroup.get(k) ?? [];
      arr.push(p.playerId);
      placedByGroup.set(k, arr);
    }

    // 후반 배치 맵
    const secondLaneOf = new Map<number, number>();
    if (secondHalf) {
      for (const p of secondHalf) secondLaneOf.set(p.playerId, p.lane);
    }
    const firstLaneOf = new Map<number, number>();
    for (const p of placements) firstLaneOf.set(p.playerId, p.lane);

    const hasSecondHalf =
      event.halftime_split_at != null &&
      event.halftime_split_at < event.games_count &&
      secondHalf != null;

    // 후반 타순: secondHalf 배열 순서가 곧 후반 레인 내 치는 순서.
    const secondOrderIndex = new Map<number, number>();
    if (secondHalf) {
      secondHalf.forEach((p, i) => {
        if (!secondOrderIndex.has(p.playerId))
          secondOrderIndex.set(p.playerId, i);
      });
    }

    for (const t of team5Teams) {
      const groupMembers = placedByGroup.get(t.gkey) ?? [];
      const benchIds = groupMembers.filter((id) => !t.starters1.includes(id));
      const roster = [...t.starters1, ...benchIds]; // 보통 5 + 1

      // 멤버 등록 (스타터 먼저, 그 뒤 벤치)
      const memRows = roster.map((pid, i) => ({
        tournament_team_id: t.teamId,
        tournament_player_id: pid,
        member_order: i + 1,
      }));
      const { error: memErr } = await supabase
        .from("tournament_team_members")
        .insert(memRows);
      if (memErr) return { error: memErr.message };

      // 후반 스타터 계산
      let starters2 = t.starters1;
      if (hasSecondHalf) {
        const atTeamLane = roster.filter(
          (pid) => secondLaneOf.get(pid) === t.baseLane,
        );
        if (atTeamLane.length === teamSize("team5")) starters2 = atTeamLane;
      }
      const s1 = new Set(t.starters1);
      const s2 = new Set(starters2);

      // 게임별 라인업
      const lineupRows: LineupInsert[] = [];
      for (let g = 1; g <= event.games_count; g++) {
        const starterSet =
          event.halftime_split_at != null && g > event.halftime_split_at
            ? s2
            : s1;
        for (const pid of roster) {
          lineupRows.push({
            tournament_team_id: t.teamId,
            game_number: g,
            tournament_player_id: pid,
            role: starterSet.has(pid) ? "starter" : "bench",
          });
        }
      }
      const { error: luErr } = await supabase
        .from("event_lineups")
        .insert(lineupRows);
      if (luErr) return { error: luErr.message };

      // 후반 배치(half=2): 후반 레인의 멤버를 타순(secondOrderIndex)대로 기록.
      // 레인이 전반과 같아도 후반 타순을 별도로 보존하기 위해 모두 기록한다.
      if (hasSecondHalf) {
        const bySecondLane = new Map<number, number[]>();
        for (const pid of roster) {
          const sl = secondLaneOf.get(pid) ?? firstLaneOf.get(pid);
          if (sl == null) continue;
          const arr = bySecondLane.get(sl) ?? [];
          arr.push(pid);
          bySecondLane.set(sl, arr);
        }
        const overrides: LapInsert[] = [];
        for (const [lane, members] of bySecondLane) {
          const laId = laByBaseLane.get(lane);
          if (laId == null) continue; // 후반 새 레인은 미지원
          const ordered = members
            .slice()
            .sort(
              (a, b) =>
                (secondOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) -
                (secondOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER),
            );
          for (const pid of ordered) {
            overrides.push({
              lane_assignment_id: laId,
              tournament_player_id: pid,
              half: 2,
            });
          }
        }
        if (overrides.length) {
          const { error: ovErr } = await supabase
            .from("lane_assignment_players")
            .insert(overrides);
          if (ovErr) return { error: ovErr.message };
        }
      }
    }
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/events/${eventId}/lanes`);
  return { message: "레인 배정이 저장되었습니다." };
}

export async function resetLaneAssignment(
  tournamentId: number,
  eventId: number,
  squadNumber: number = 1,
): Promise<LaneActionResult> {
  const supabase = await createClient();
  const v = await loadEvent(supabase, tournamentId, eventId);
  if ("error" in v) return { error: v.error };
  const squadCount = Math.max(1, v.event.squad_count);

  const clearErr = await clearSquad(supabase, eventId, squadNumber, squadCount);
  if (clearErr) return { error: clearErr };

  revalidatePath(`/admin/tournaments/${tournamentId}/events/${eventId}/lanes`);
  return { message: "레인 배정을 초기화했습니다." };
}
