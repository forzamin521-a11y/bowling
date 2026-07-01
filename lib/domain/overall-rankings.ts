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

export type OverallRow = {
  tpId: number;
  playerNumber: number;
  regionName: string;
  affiliationName: string;
  name: string;
  total: number;
  games: number;
  byType: Partial<Record<EventType, { total: number; games: number }>>;
};

export type OverallCategory = {
  id: number;
  label: string;
  types: EventType[];
  rows: OverallRow[]; // total 내림차순, games>0 만
};

export type OverallRankings = {
  tournamentName: string;
  categories: OverallCategory[];
};

type RankRow = {
  tournament_event_id: number;
  tournament_player_id: number;
  games_played: number;
  total: number;
};
type TpRow = {
  id: number;
  region_id: number;
  affiliation_name: string;
  player_number: number;
};
type Agg = {
  tpId: number;
  total: number;
  games: number;
  byType: Partial<Record<EventType, { total: number; games: number }>>;
};

/**
 * 종별로 개인의 전 세부종목(개인전·2/3/5인조) 점수를 합산한 종합 순위.
 * 관리자/공개 페이지가 동일 데이터를 공유한다. 마감된 게임만 반영(rankings 캐시 기준).
 */
export async function computeOverallRankings(
  supabase: Client,
  tid: number,
  categoryId?: number,
): Promise<OverallRankings | null> {
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

  const { data: events } = catIds.length
    ? await supabase
        .from("tournament_events")
        .select("id, tournament_category_id, event_type")
        .in("tournament_category_id", catIds)
    : {
        data: [] as {
          id: number;
          tournament_category_id: number;
          event_type: string;
        }[],
      };
  const evList = events ?? [];
  const catByEvent = new Map(
    evList.map((e) => [e.id, e.tournament_category_id]),
  );
  const typeByEvent = new Map(
    evList.map((e) => [e.id, e.event_type as EventType]),
  );
  const eventIds = evList.map((e) => e.id);

  // 종별별 등장 종목유형 (정렬)
  const typesByCat = new Map<number, EventType[]>();
  for (const c of catList) {
    const types = [
      ...new Set(
        evList
          .filter((e) => e.tournament_category_id === c.id)
          .map((e) => e.event_type as EventType),
      ),
    ].sort((a, b) => EVENT_TYPE_ORDER.indexOf(a) - EVENT_TYPE_ORDER.indexOf(b));
    typesByCat.set(c.id, types);
  }

  const { data: rankRows } = eventIds.length
    ? await supabase
        .from("rankings")
        .select("tournament_event_id, tournament_player_id, games_played, total")
        .in("tournament_event_id", eventIds)
    : { data: [] as RankRow[] };
  const rows = (rankRows ?? []) as RankRow[];

  // 선수별로 전 세부종목 합산 (종별 안에서) + 종목유형별 내역
  const aggByCat = new Map<number, Map<number, Agg>>();
  for (const r of rows) {
    const cid = catByEvent.get(r.tournament_event_id);
    const type = typeByEvent.get(r.tournament_event_id);
    if (cid == null || type == null) continue;
    let m = aggByCat.get(cid);
    if (!m) {
      m = new Map();
      aggByCat.set(cid, m);
    }
    const cur = m.get(r.tournament_player_id) ?? {
      tpId: r.tournament_player_id,
      total: 0,
      games: 0,
      byType: {},
    };
    cur.total += r.total;
    cur.games += r.games_played;
    const bt = cur.byType[type] ?? { total: 0, games: 0 };
    bt.total += r.total;
    bt.games += r.games_played;
    cur.byType[type] = bt;
    m.set(r.tournament_player_id, cur);
  }

  // 선수 메타 + 이름
  const allTpIds = [...new Set(rows.map((r) => r.tournament_player_id))];
  const [{ data: tpRows }, { data: nameRows }, { data: regions }] =
    await Promise.all([
      allTpIds.length
        ? supabase
            .from("tournament_players")
            .select("id, region_id, affiliation_name, player_number")
            .in("id", allTpIds)
        : Promise.resolve({ data: [] as TpRow[] }),
      allTpIds.length
        ? supabase
            .from("participant_names")
            .select("tournament_player_id, name")
            .in("tournament_player_id", allTpIds)
        : Promise.resolve({
            data: [] as { tournament_player_id: number; name: string }[],
          }),
      supabase.from("regions").select("id, name"),
    ]);
  const tpById = new Map(((tpRows ?? []) as TpRow[]).map((r) => [r.id, r]));
  const nameById = new Map(
    (nameRows ?? []).map((n) => [n.tournament_player_id, n.name]),
  );
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  const resultCategories: OverallCategory[] = catList.map((c) => {
    const aggMap = aggByCat.get(c.id);
    const ranked = [...(aggMap?.values() ?? [])]
      .filter((a) => a.games > 0)
      .sort((a, b) => b.total - a.total)
      .map((a) => {
        const tp = tpById.get(a.tpId);
        return {
          tpId: a.tpId,
          playerNumber: tp?.player_number ?? 0,
          regionName: regionById.get(tp?.region_id ?? -1) ?? "",
          affiliationName: tp?.affiliation_name ?? "",
          name: nameById.get(a.tpId) ?? "",
          total: a.total,
          games: a.games,
          byType: a.byType,
        };
      });
    return {
      id: c.id,
      label: categoryFullLabel(c.age as CategoryAge, c.gender as Gender),
      types: typesByCat.get(c.id) ?? [],
      rows: ranked,
    };
  });

  return { tournamentName: tournament.name, categories: resultCategories };
}
