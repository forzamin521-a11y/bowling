import {
  CATEGORY_AGE_ORDER,
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

/** 메달 표의 종목 한 줄을 식별하는 키 (실제 종목 + 개인종합). */
export type MedalRowType = EventType | "overall";

/** 종목별 메달현황 한 행: 금/은/동/4위에 해당하는 팀 식별 라벨(없으면 null). */
export type MedalRow = {
  type: MedalRowType;
  /** [금, 은, 동, 4위] */
  places: (string | null)[];
  /** 이 종목이 마감됐는지. false면 places는 비고 UI에서 '집계 중' 표시. */
  finished: boolean;
};

/** 팀(소속+팀라벨) 종합순위 한 행. */
export type TeamStanding = {
  team: string;
  gold: number;
  silver: number;
  bronze: number;
  fourth: number;
  rank: number;
};

export type CategoryMedals = {
  id: number;
  label: string;
  rows: MedalRow[];
  standings: TeamStanding[];
  /** 이 종별의 모든 세부종목이 마감됐는지. */
  allFinished: boolean;
  /** 이 종별의 세부종목 중 하나라도 마감됐는지 (부분 표시 여부). */
  anyFinished: boolean;
};

export type MedalTally = {
  tournamentName: string;
  /** 모든 종별의 모든 세부종목이 마감됐는지 (마감 전이면 UI에서 안내) */
  allFinished: boolean;
  categories: CategoryMedals[];
};

type EventMeta = {
  id: number;
  categoryId: number;
  type: EventType;
  gamesCount: number;
  squadCount: number;
};

/** 소속 + 팀라벨(+팀순번)을 하나의 팀 식별 문자열로. 예: 토평고A, 토평고A-2 */
function teamIdent(affiliation: string, teamLabel: string, teamSeq?: number) {
  const base = `${affiliation ?? ""}${teamLabel ?? ""}`.trim();
  return teamSeq && teamSeq > 1 ? `${base}-${teamSeq}` : base;
}

const PLACE_COUNT = 4; // 금/은/동/4위

/**
 * 종별(연령·성별)마다 종목별 메달현황과 팀 종합순위를 집계한다.
 * - 메달 단위: 소속 + 팀라벨 (개인전/개인종합은 해당 선수의 소속+팀라벨로 귀속)
 * - 개인종합: 종별 안에서 개인의 전 세부종목 점수를 합산한 1~4위
 * - 팀 종합순위: 금→은→동→4위 개수 순 (올림픽 방식)
 * 마감된 게임만 반영(rankings/team_rankings 캐시 기준).
 */
export async function computeMedalTally(
  supabase: Client,
  tid: number,
  categoryId?: number,
): Promise<MedalTally | null> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) return null;

  const { data: categories } = await supabase
    .from("tournament_categories")
    .select("id, age, gender")
    .eq("tournament_id", tid);
  const catList = (categories ?? [])
    .filter((c) => categoryId == null || c.id === categoryId)
    .slice()
    .sort((a, b) => {
      const ai = CATEGORY_AGE_ORDER.indexOf(a.age as CategoryAge);
      const bi = CATEGORY_AGE_ORDER.indexOf(b.age as CategoryAge);
      if (ai !== bi) return ai - bi;
      return (
        GENDER_ORDER.indexOf(a.gender as Gender) -
        GENDER_ORDER.indexOf(b.gender as Gender)
      );
    });
  const catIds = catList.map((c) => c.id);

  const { data: eventRows } = catIds.length
    ? await supabase
        .from("tournament_events")
        .select(
          "id, tournament_category_id, event_type, games_count, squad_count",
        )
        .in("tournament_category_id", catIds)
    : { data: [] as Record<string, unknown>[] };
  const events: EventMeta[] = (eventRows ?? []).map((e) => ({
    id: e.id as number,
    categoryId: e.tournament_category_id as number,
    type: e.event_type as EventType,
    gamesCount: e.games_count as number,
    squadCount: Math.max(1, (e.squad_count as number) ?? 1),
  }));
  const eventIds = events.map((e) => e.id);
  const teamEventIds = events
    .filter((e) => e.type !== "single")
    .map((e) => e.id);

  // ---- 마감 여부: 종목별 모든 조의 모든 게임이 locked 인지 ----
  const { data: gsRows } = eventIds.length
    ? await supabase
        .from("game_states")
        .select("tournament_event_id, game_number, status, squad_number")
        .in("tournament_event_id", eventIds)
    : { data: [] as Record<string, unknown>[] };
  const lockedBy = new Map<number, Map<number, Set<number>>>(); // eid -> squad -> games
  for (const g of gsRows ?? []) {
    if ((g.status as string) !== "locked") continue;
    const eid = g.tournament_event_id as number;
    const sq = g.squad_number as number;
    let bySquad = lockedBy.get(eid);
    if (!bySquad) {
      bySquad = new Map();
      lockedBy.set(eid, bySquad);
    }
    const set = bySquad.get(sq) ?? new Set<number>();
    set.add(g.game_number as number);
    bySquad.set(sq, set);
  }
  const eventFinished = (e: EventMeta) => {
    for (let sq = 1; sq <= e.squadCount; sq++) {
      const n = lockedBy.get(e.id)?.get(sq)?.size ?? 0;
      if (n < e.gamesCount) return false;
    }
    return true;
  };
  const allFinished = events.length > 0 && events.every(eventFinished);

  // ---- 개인 랭킹 (개인전 메달 + 개인종합 계산) ----
  const { data: indRows } = eventIds.length
    ? await supabase
        .from("rankings")
        .select("tournament_event_id, tournament_player_id, rank, total, games_played")
        .in("tournament_event_id", eventIds)
    : {
        data: [] as {
          tournament_event_id: number;
          tournament_player_id: number;
          rank: number | null;
          total: number;
          games_played: number;
        }[],
      };
  const individualRankings = indRows ?? [];

  // ---- 팀 랭킹 (2/3/5인조 메달) ----
  const { data: trRows } = teamEventIds.length
    ? await supabase
        .from("team_rankings")
        .select("tournament_event_id, tournament_team_id, rank")
        .in("tournament_event_id", teamEventIds)
    : {
        data: [] as {
          tournament_event_id: number;
          tournament_team_id: number;
          rank: number | null;
        }[],
      };
  const teamRankings = trRows ?? [];

  // ---- 메타: 팀 / 선수 ----
  const { data: teamMetaRows } = teamEventIds.length
    ? await supabase
        .from("tournament_teams")
        .select("id, affiliation_name, team_label, team_seq")
        .in("tournament_event_id", teamEventIds)
    : {
        data: [] as {
          id: number;
          affiliation_name: string;
          team_label: string;
          team_seq: number;
        }[],
      };
  const teamById = new Map(
    (teamMetaRows ?? []).map((t) => [
      t.id,
      teamIdent(t.affiliation_name, t.team_label, t.team_seq),
    ]),
  );

  const tpIds = [
    ...new Set(individualRankings.map((r) => r.tournament_player_id)),
  ];
  const { data: tpRows } = tpIds.length
    ? await supabase
        .from("tournament_players")
        .select("id, affiliation_name, team_label")
        .in("id", tpIds)
    : { data: [] as { id: number; affiliation_name: string; team_label: string }[] };
  const tpIdentById = new Map(
    (tpRows ?? []).map((t) => [
      t.id,
      teamIdent(t.affiliation_name, t.team_label),
    ]),
  );

  // 종목별 인덱싱
  const eventsByCat = new Map<number, EventMeta[]>();
  for (const e of events) {
    const arr = eventsByCat.get(e.categoryId) ?? [];
    arr.push(e);
    eventsByCat.set(e.categoryId, arr);
  }
  const indByEvent = new Map<number, typeof individualRankings>();
  for (const r of individualRankings) {
    const arr = indByEvent.get(r.tournament_event_id) ?? [];
    arr.push(r);
    indByEvent.set(r.tournament_event_id, arr);
  }
  const teamByEvent = new Map<number, typeof teamRankings>();
  for (const r of teamRankings) {
    const arr = teamByEvent.get(r.tournament_event_id) ?? [];
    arr.push(r);
    teamByEvent.set(r.tournament_event_id, arr);
  }

  // 랭킹 배열을 rank 오름차순으로 정렬 후 상위 4개를 식별 라벨로
  function topFour<T>(
    rows: T[],
    getRank: (r: T) => number | null,
    getIdent: (r: T) => string,
  ): (string | null)[] {
    const sorted = rows
      .slice()
      .filter((r) => getRank(r) != null)
      .sort((a, b) => (getRank(a) as number) - (getRank(b) as number));
    const places: (string | null)[] = [];
    for (let i = 0; i < PLACE_COUNT; i++) {
      places.push(sorted[i] ? getIdent(sorted[i]) : null);
    }
    return places;
  }

  const resultCategories: CategoryMedals[] = catList.map((c) => {
    const evs = (eventsByCat.get(c.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          EVENT_TYPE_ORDER.indexOf(a.type) - EVENT_TYPE_ORDER.indexOf(b.type),
      );

    const emptyPlaces = (): (string | null)[] => Array(PLACE_COUNT).fill(null);

    const categoryAllFinished = evs.length > 0 && evs.every(eventFinished);
    const categoryAnyFinished = evs.some(eventFinished);

    const rows: MedalRow[] = [];

    // 실제 세부종목 (등장 순서, 같은 타입 중복 시 첫 종목)
    // 마감된 종목만 메달을 확정 표시하고, 진행 중이면 finished:false 로 둔다.
    const seenType = new Set<EventType>();
    for (const e of evs) {
      if (seenType.has(e.type)) continue;
      seenType.add(e.type);
      const finished = eventFinished(e);
      if (!finished) {
        rows.push({ type: e.type, places: emptyPlaces(), finished: false });
        continue;
      }
      if (e.type === "single") {
        const rows4 = topFour(
          indByEvent.get(e.id) ?? [],
          (r) => r.rank,
          (r) => tpIdentById.get(r.tournament_player_id) ?? "",
        );
        rows.push({ type: "single", places: rows4, finished: true });
      } else {
        const rows4 = topFour(
          teamByEvent.get(e.id) ?? [],
          (r) => r.rank,
          (r) => teamById.get(r.tournament_team_id) ?? "",
        );
        rows.push({ type: e.type, places: rows4, finished: true });
      }
    }

    // 개인종합: 전 세부종목 합산이라 모든 종목이 마감된 뒤에만 확정.
    const overallAgg = new Map<number, { total: number; games: number }>();
    for (const e of evs) {
      for (const r of indByEvent.get(e.id) ?? []) {
        const cur = overallAgg.get(r.tournament_player_id) ?? {
          total: 0,
          games: 0,
        };
        cur.total += r.total;
        cur.games += r.games_played;
        overallAgg.set(r.tournament_player_id, cur);
      }
    }
    const overallSorted = [...overallAgg.entries()]
      .filter(([, v]) => v.games > 0)
      .sort((a, b) => b[1].total - a[1].total);
    if (overallSorted.length > 0) {
      if (categoryAllFinished) {
        const overallPlaces: (string | null)[] = [];
        for (let i = 0; i < PLACE_COUNT; i++) {
          const entry = overallSorted[i];
          overallPlaces.push(entry ? (tpIdentById.get(entry[0]) ?? "") : null);
        }
        rows.push({ type: "overall", places: overallPlaces, finished: true });
      } else {
        rows.push({ type: "overall", places: emptyPlaces(), finished: false });
      }
    }

    // ---- 팀 종합순위: 마감된 종목의 메달만 집계 ----
    const tally = new Map<
      string,
      { gold: number; silver: number; bronze: number; fourth: number }
    >();
    for (const row of rows) {
      if (!row.finished) continue;
      row.places.forEach((team, idx) => {
        if (!team) return;
        const t = tally.get(team) ?? {
          gold: 0,
          silver: 0,
          bronze: 0,
          fourth: 0,
        };
        if (idx === 0) t.gold += 1;
        else if (idx === 1) t.silver += 1;
        else if (idx === 2) t.bronze += 1;
        else t.fourth += 1;
        tally.set(team, t);
      });
    }
    const standingsBase = [...tally.entries()].map(([team, m]) => ({
      team,
      ...m,
    }));
    const cmp = (
      a: (typeof standingsBase)[number],
      b: (typeof standingsBase)[number],
    ) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      b.fourth - a.fourth;
    standingsBase.sort((a, b) => cmp(a, b) || a.team.localeCompare(b.team));
    const standings: TeamStanding[] = standingsBase.map((s, i, arr) => {
      // 동순위 처리(올림픽 방식): 앞에 더 좋은 팀 수 + 1
      const rank = 1 + arr.filter((o) => cmp(o, s) < 0).length;
      return { ...s, rank };
    });

    return {
      id: c.id,
      label: categoryFullLabel(c.age as CategoryAge, c.gender as Gender),
      rows,
      standings,
      allFinished: categoryAllFinished,
      anyFinished: categoryAnyFinished,
    };
  });

  return {
    tournamentName: tournament.name,
    allFinished,
    categories: resultCategories,
  };
}
