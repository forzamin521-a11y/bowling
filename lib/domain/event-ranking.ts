import type { createClient } from "@/lib/supabase/server";
import type { EventType, LineupRole } from "@/lib/supabase/database.types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type IndividualRow = {
  tournamentPlayerId: number;
  rank: number | null;
  regionName: string;
  affiliationName: string;
  playerNumber: number;
  teamLabel: string;
  name: string;
  total: number;
  avg: number | null;
  pinDiff: number | null;
  games: Record<number, number>;
  starterByGame?: Record<number, boolean>;
};

export type MemberRow = {
  tournamentPlayerId: number;
  playerNumber: number;
  name: string;
  games: Record<number, number>;
  starterByGame?: Record<number, boolean>;
};

export type TeamGroup = {
  teamId: number;
  rank: number | null;
  regionName: string;
  affiliationName: string;
  teamLabel: string;
  members: MemberRow[];
  teamGames: Record<number, number>;
  total: number;
  avg: number | null;
  pinDiff: number | null;
};

/** 하위호환용 중간 계산 타입 (page에서 사용). */
export type TeamRow = {
  teamId: number;
  rank: number | null;
  regionName: string;
  affiliationName: string;
  teamLabel: string;
  total: number;
  avg: number | null;
  pinDiff: number | null;
  games: Record<number, number>;
};

export type EventRanking = {
  eventType: EventType;
  gamesCount: number;
  lockedGames: number[];
  individualRows: IndividualRow[];
  teamGroups: TeamGroup[];
  regionsPresent: string[];
};

/**
 * 한 세부종목의 개인/팀 순위표 데이터를 계산한다 (레인보드 제외).
 * 공개 종목순위 페이지(PublicRankingPage)의 순위 계산과 동일한 규칙:
 * 마감된 게임만 합계·순위에 반영하고, 분반(squad)된 경우 해당 조가 마감한
 * 게임만 노출한다. team5는 라인업 스타터 점수만 팀 합계에 합산한다.
 */
export async function computeEventRanking(
  supabase: Client,
  eid: number,
): Promise<EventRanking | null> {
  const { data: event } = await supabase
    .from("tournament_events")
    .select("id, event_type, games_count, squad_count")
    .eq("id", eid)
    .maybeSingle();
  if (!event) return null;

  const eventType = event.event_type as EventType;
  const isTeam = eventType !== "single";
  const squadCount = Math.max(1, event.squad_count);

  const { data: regions } = await supabase.from("regions").select("id, name");
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  // 마감 게임 (조별)
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

  // 조 멤버십 (분반된 경우)
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
    {
      region_id: number;
      affiliation_name: string;
      team_label: string;
      team_seq: number;
    }
  >();
  const membersByTeam = new Map<number, number[]>();
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
      : {
          data: [] as {
            tournament_team_id: number;
            tournament_player_id: number;
          }[],
        };
    for (const m of memRows ?? []) {
      const arr = membersByTeam.get(m.tournament_team_id) ?? [];
      arr.push(m.tournament_player_id);
      membersByTeam.set(m.tournament_team_id, arr);
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

  // 참가 선수명 + 메타
  const allTpIds = [
    ...new Set([...rankTpIds, ...[...membersByTeam.values()].flat()]),
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

  const { data: tpRows } = allTpIds.length
    ? await supabase
        .from("tournament_players")
        .select("id, region_id, affiliation_name, player_number, team_label")
        .in("id", allTpIds)
    : {
        data: [] as {
          id: number;
          region_id: number;
          affiliation_name: string;
          player_number: number;
          team_label: string;
        }[],
      };
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
  let teamRowsOut: TeamRow[] = [];
  if (isTeam) {
    const { data: trRows } = await supabase
      .from("team_rankings")
      .select(
        "tournament_team_id, total, avg, high_game, rank, pin_diff_from_first",
      )
      .eq("tournament_event_id", eid);
    teamRowsOut = (trRows ?? [])
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

  // 팀 묶음 (멤버 개인점수 + 팀 합계)
  let teamGroups: TeamGroup[] = [];
  if (isTeam) {
    teamGroups = teamRowsOut.map((tr) => {
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

  const regionsPresent = [
    ...new Set([
      ...individualRows.map((r) => r.regionName),
      ...teamRowsOut.map((r) => r.regionName),
    ]),
  ].filter(Boolean);

  return {
    eventType,
    gamesCount: event.games_count,
    lockedGames,
    individualRows,
    teamGroups,
    regionsPresent,
  };
}
