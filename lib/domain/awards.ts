import { computeEventRanking } from "@/lib/domain/event-ranking";
import { computeOverallRankings } from "@/lib/domain/overall-rankings";
import {
  CATEGORY_AGE_ORDER,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_ORDER,
  GENDER_ORDER,
  categoryFullLabel,
} from "@/lib/domain/labels";
import type { createClient } from "@/lib/supabase/server";
import type {
  CategoryAge,
  EventType,
  Gender,
} from "@/lib/supabase/database.types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** 상장 대상 순위 범위 (금/은/동/4위). */
export const MAX_AWARD_RANK = 4;

export type AwardRecipient = {
  name: string;
  playerNumber: number;
};

/** 상장 한 장(팀 종목은 팀 단위 한 건)의 데이터. */
export type AwardEntry = {
  /** 클라이언트 선택용 고유 키. */
  key: string;
  categoryId: number;
  categoryLabel: string;
  /** 실제 세부종목 또는 개인종합. */
  eventKind: EventType | "overall";
  eventLabel: string;
  rank: number;
  isTeam: boolean;
  regionName: string;
  affiliationName: string;
  /** 팀 종목일 때 "소속+팀라벨(-순번)" 표시명. 개인은 null. */
  teamName: string | null;
  recipients: AwardRecipient[];
  total: number;
  gamesPlayed: number | null;
  /** 해당 종목(개인종합은 종별 전체)이 마감됐는지. */
  finished: boolean;
};

export type AwardEventGroup = {
  eventKind: EventType | "overall";
  eventLabel: string;
  finished: boolean;
  entries: AwardEntry[];
};

export type AwardCategoryGroup = {
  categoryId: number;
  categoryLabel: string;
  events: AwardEventGroup[];
};

type EventMeta = {
  id: number;
  categoryId: number;
  type: EventType;
  gamesCount: number;
  squadCount: number;
};

/**
 * 대회의 상장 수여 대상(종별 × 종목 × 1~4위)을 집계한다.
 * 순위는 rankings/team_rankings 캐시(마감 게임 기준)를 그대로 사용하고,
 * 종목 마감 여부는 모든 조의 모든 게임 lock 기준으로 판정한다.
 */
export async function computeAwards(
  supabase: Client,
  tid: number,
): Promise<AwardCategoryGroup[]> {
  const { data: categories } = await supabase
    .from("tournament_categories")
    .select("id, age, gender")
    .eq("tournament_id", tid);
  const catList = (categories ?? []).slice().sort((a, b) => {
    const ai = CATEGORY_AGE_ORDER.indexOf(a.age as CategoryAge);
    const bi = CATEGORY_AGE_ORDER.indexOf(b.age as CategoryAge);
    if (ai !== bi) return ai - bi;
    return (
      GENDER_ORDER.indexOf(a.gender as Gender) -
      GENDER_ORDER.indexOf(b.gender as Gender)
    );
  });
  const catIds = catList.map((c) => c.id);
  if (!catIds.length) return [];

  const { data: eventRows } = await supabase
    .from("tournament_events")
    .select("id, tournament_category_id, event_type, games_count, squad_count")
    .in("tournament_category_id", catIds);
  const events: EventMeta[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    categoryId: e.tournament_category_id,
    type: e.event_type as EventType,
    gamesCount: e.games_count,
    squadCount: Math.max(1, e.squad_count ?? 1),
  }));
  const eventIds = events.map((e) => e.id);

  // 종목 마감 여부: 모든 조의 모든 게임이 locked (medal-tally와 동일 규칙)
  const { data: gsRows } = eventIds.length
    ? await supabase
        .from("game_states")
        .select("tournament_event_id, game_number, status, squad_number")
        .in("tournament_event_id", eventIds)
    : { data: [] as never[] };
  const lockedBy = new Map<number, Map<number, Set<number>>>();
  for (const g of gsRows ?? []) {
    if (g.status !== "locked") continue;
    let bySquad = lockedBy.get(g.tournament_event_id);
    if (!bySquad) {
      bySquad = new Map();
      lockedBy.set(g.tournament_event_id, bySquad);
    }
    const set = bySquad.get(g.squad_number) ?? new Set<number>();
    set.add(g.game_number);
    bySquad.set(g.squad_number, set);
  }
  const eventFinished = (e: EventMeta) => {
    for (let sq = 1; sq <= e.squadCount; sq++) {
      if ((lockedBy.get(e.id)?.get(sq)?.size ?? 0) < e.gamesCount) return false;
    }
    return true;
  };

  // 종별 → 종목유형별 대표 종목 (같은 타입 중복 시 첫 종목)
  const eventsByCat = new Map<number, EventMeta[]>();
  for (const e of events) {
    const arr = eventsByCat.get(e.categoryId) ?? [];
    arr.push(e);
    eventsByCat.set(e.categoryId, arr);
  }

  const overall = await computeOverallRankings(supabase, tid);
  const overallByCat = new Map(
    (overall?.categories ?? []).map((c) => [c.id, c]),
  );

  const result: AwardCategoryGroup[] = [];

  for (const c of catList) {
    const categoryLabel = categoryFullLabel(
      c.age as CategoryAge,
      c.gender as Gender,
    );
    const evs = (eventsByCat.get(c.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          EVENT_TYPE_ORDER.indexOf(a.type) - EVENT_TYPE_ORDER.indexOf(b.type),
      );

    const eventGroups: AwardEventGroup[] = [];
    const seenType = new Set<EventType>();

    for (const e of evs) {
      if (seenType.has(e.type)) continue;
      seenType.add(e.type);

      const ranking = await computeEventRanking(supabase, e.id);
      if (!ranking) continue;
      const finished = eventFinished(e);
      const eventLabel = EVENT_TYPE_LABEL[e.type];
      const entries: AwardEntry[] = [];

      if (e.type === "single") {
        for (const row of ranking.individualRows) {
          if (row.rank == null || row.rank > MAX_AWARD_RANK) continue;
          entries.push({
            key: `s:${e.id}:${row.tournamentPlayerId}`,
            categoryId: c.id,
            categoryLabel,
            eventKind: e.type,
            eventLabel,
            rank: row.rank,
            isTeam: false,
            regionName: row.regionName,
            affiliationName: row.affiliationName,
            teamName: null,
            recipients: [
              { name: row.name, playerNumber: row.playerNumber },
            ],
            total: row.total,
            gamesPlayed: Object.keys(row.games).length,
            finished,
          });
        }
      } else {
        for (const group of ranking.teamGroups) {
          if (group.rank == null || group.rank > MAX_AWARD_RANK) continue;
          entries.push({
            key: `t:${e.id}:${group.teamId}`,
            categoryId: c.id,
            categoryLabel,
            eventKind: e.type,
            eventLabel,
            rank: group.rank,
            isTeam: true,
            regionName: group.regionName,
            affiliationName: group.affiliationName,
            teamName:
              `${group.affiliationName} ${group.teamLabel}`.trim(),
            recipients: group.members.map((m) => ({
              name: m.name,
              playerNumber: m.playerNumber,
            })),
            total: group.total,
            gamesPlayed: null,
            finished,
          });
        }
      }

      entries.sort((a, b) => a.rank - b.rank);
      if (entries.length) {
        eventGroups.push({ eventKind: e.type, eventLabel, finished, entries });
      }
    }

    // 개인종합: 종별 전 세부종목 합산. 모든 종목 마감 시에만 확정으로 표시.
    const categoryAllFinished = evs.length > 0 && evs.every(eventFinished);
    const overallCat = overallByCat.get(c.id);
    if (overallCat && overallCat.rows.length > 0) {
      const rows = overallCat.rows; // total 내림차순 정렬 상태
      const entries: AwardEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // 동점 처리: 자신보다 총점 높은 인원 수 + 1
        const rank = 1 + rows.filter((r) => r.total > row.total).length;
        if (rank > MAX_AWARD_RANK) continue;
        entries.push({
          key: `o:${c.id}:${row.tpId}`,
          categoryId: c.id,
          categoryLabel,
          eventKind: "overall",
          eventLabel: "개인종합",
          rank,
          isTeam: false,
          regionName: row.regionName,
          affiliationName: row.affiliationName,
          teamName: null,
          recipients: [{ name: row.name, playerNumber: row.playerNumber }],
          total: row.total,
          gamesPlayed: row.games,
          finished: categoryAllFinished,
        });
      }
      entries.sort((a, b) => a.rank - b.rank);
      if (entries.length) {
        eventGroups.push({
          eventKind: "overall",
          eventLabel: "개인종합",
          finished: categoryAllFinished,
          entries,
        });
      }
    }

    if (eventGroups.length) {
      result.push({ categoryId: c.id, categoryLabel, events: eventGroups });
    }
  }

  return result;
}
