"use client";

import { useMemo, useState } from "react";

import { RankMedal, podiumRowClass } from "@/components/public/rank-medal";
import { Input } from "@/components/ui/input";
import { useRankingsRealtime } from "@/hooks/use-rankings-realtime";
import type {
  IndividualRow,
  MemberRow,
  TeamGroup,
  TeamRow,
} from "@/lib/domain/event-ranking";
import type { EventType } from "@/lib/supabase/database.types";
import { cn, fmtAvg, fmtScore } from "@/lib/utils";

export type { IndividualRow, MemberRow, TeamGroup, TeamRow };

function fmtPin(pin: number | null) {
  if (pin == null) return "–";
  return pin === 0 ? "0" : fmtScore(pin);
}

export function RankingTable({
  eventId,
  eventType,
  gamesCount,
  lockedGames,
  individualRows,
  teamGroups,
  regionsPresent,
}: {
  eventId: number;
  eventType: EventType;
  gamesCount: number;
  lockedGames: number[];
  individualRows: IndividualRow[];
  teamGroups: TeamGroup[];
  regionsPresent: string[];
}) {
  useRankingsRealtime(eventId);

  const isTeam = eventType !== "single";
  const isTeam5 = eventType === "team5";
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [affQ, setAffQ] = useState("");
  const [nameQ, setNameQ] = useState("");

  const games = useMemo(
    () => Array.from({ length: gamesCount }, (_, i) => i + 1),
    [gamesCount],
  );
  const lockedSet = useMemo(() => new Set(lockedGames), [lockedGames]);

  function toggleRegion(r: string) {
    setRegions((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  const matchRegion = (r: string) => regions.size === 0 || regions.has(r);
  const aff = affQ.trim();
  const nm = nameQ.trim();

  const filteredIndividuals = individualRows.filter(
    (row) =>
      matchRegion(row.regionName) &&
      (aff === "" || row.affiliationName.includes(aff)) &&
      (nm === "" || row.name.includes(nm)),
  );
  const filteredTeams = teamGroups.filter(
    (g) =>
      matchRegion(g.regionName) &&
      (aff === "" || g.affiliationName.includes(aff)),
  );

  // 컬럼 수: 팀 = 번호+이름+games+합계+평균+핀차, 개인 = 순위+시군+소속+번호+이름+games+합계+평균+핀차
  const teamColSpan = 2 + games.length + 3;
  const indColSpan = 5 + games.length + 3;

  return (
    <div className="grid gap-3">
      {/* 필터 */}
      <div className="grid gap-2">
        {regionsPresent.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {regionsPresent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRegion(r)}
                aria-pressed={regions.has(r)}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  regions.has(r)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input
            value={affQ}
            onChange={(e) => setAffQ(e.target.value)}
            placeholder="소속 검색"
            className="h-9 w-full sm:max-w-[10rem]"
          />
          {!isTeam && (
            <Input
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              placeholder="이름 검색"
              className="h-9 w-full sm:max-w-[10rem]"
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        {isTeam ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-2 text-center font-medium">번호</th>
                <th className="px-2 py-2 text-left font-medium">이름</th>
                {games.map((g) => (
                  <th key={g} className="px-2 py-2 text-center font-medium">
                    {g}G
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium">합계</th>
                <th className="px-2 py-2 text-center font-medium">평균</th>
                <th className="px-2 py-2 text-center font-medium">핀차</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((g) => (
                <TeamBlock
                  key={g.teamId}
                  group={g}
                  games={games}
                  lockedSet={lockedSet}
                  team5={isTeam5}
                  colSpan={teamColSpan}
                />
              ))}
              {filteredTeams.length === 0 && (
                <tr>
                  <td
                    colSpan={teamColSpan}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    표시할 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted px-2 py-2 text-center font-medium">
                  순위
                </th>
                <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">
                  시/군
                </th>
                <th className="px-2 py-2 text-left font-medium">소속</th>
                <th className="px-2 py-2 text-center font-medium">번호</th>
                <th className="px-2 py-2 text-left font-medium">이름</th>
                {games.map((g) => (
                  <th key={g} className="px-2 py-2 text-center font-medium">
                    {g}G
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium">합계</th>
                <th className="px-2 py-2 text-center font-medium">평균</th>
                <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">
                  핀차
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredIndividuals.map((row) => {
                const podium = row.rank != null && row.rank <= 3;
                return (
                <tr
                  key={row.tournamentPlayerId}
                  className="border-b last:border-0 transition-colors hover:bg-accent/40"
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-background px-2 py-1.5 text-center",
                      podium && "border-l-2",
                      row.rank === 1 && "border-l-gold",
                      row.rank === 2 && "border-l-silver",
                      row.rank === 3 && "border-l-bronze",
                    )}
                  >
                    <RankMedal rank={row.rank} />
                  </td>
                  <td className="hidden px-2 py-1.5 sm:table-cell">
                    {row.regionName}
                  </td>
                  <td className="px-2 py-1.5">{row.affiliationName}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                    {row.playerNumber}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 font-medium",
                      podium && "font-semibold",
                    )}
                  >
                    {row.name}
                  </td>
                  {games.map((g) => (
                    <Cell
                      key={g}
                      locked={lockedSet.has(g)}
                      score={row.games[g]}
                    />
                  ))}
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                    {fmtScore(row.total)}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {fmtAvg(row.avg)}
                  </td>
                  <td className="hidden px-2 py-1.5 text-center text-muted-foreground tabular-nums sm:table-cell">
                    {fmtPin(row.pinDiff)}
                  </td>
                </tr>
                );
              })}
              {filteredIndividuals.length === 0 && (
                <tr>
                  <td
                    colSpan={indColSpan}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    표시할 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        회색 칸은 아직 마감되지 않은 게임입니다. 마감된 게임만 합계·순위에
        반영됩니다.
        {isTeam5
          ? " 회색 * 점수는 해당 게임에 팀 합계로 합산되지 않은 선수(교체 대기)입니다."
          : ""}
      </p>
    </div>
  );
}

function TeamBlock({
  group,
  games,
  lockedSet,
  team5,
  colSpan,
}: {
  group: TeamGroup;
  games: number[];
  lockedSet: Set<number>;
  team5: boolean;
  colSpan: number;
}) {
  const teamName = [group.regionName, group.affiliationName, group.teamLabel]
    .filter(Boolean)
    .join(" ");
  const podium = group.rank != null && group.rank <= 3;
  return (
    <>
      {/* 팀 헤더 밴드 */}
      <tr
        className={cn(
          "border-t-2",
          podium ? podiumRowClass(group.rank) : "bg-muted/40",
        )}
      >
        <td colSpan={colSpan} className="px-2 py-2 text-sm font-semibold">
          <span className="mr-2 inline-flex items-center align-middle">
            <RankMedal rank={group.rank} />
          </span>
          {teamName}
        </td>
      </tr>
      {/* 멤버 행 */}
      {group.members.map((m) => (
        <tr key={m.tournamentPlayerId} className="border-b last:border-0">
          <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
            {m.playerNumber}
          </td>
          <td className="px-2 py-1.5">{m.name}</td>
          {games.map((g) => (
            <MemberCell
              key={g}
              locked={lockedSet.has(g)}
              score={m.games[g]}
              counted={!team5 || (m.starterByGame?.[g] ?? false)}
              team5={team5}
            />
          ))}
          <td className="px-2 py-1.5" />
          <td className="px-2 py-1.5" />
          <td className="px-2 py-1.5" />
        </tr>
      ))}
      {/* 팀 합계 행 */}
      <tr className="border-b bg-muted/10 font-semibold">
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5 text-muted-foreground">팀 합계</td>
        {games.map((g) => (
          <Cell key={g} locked={lockedSet.has(g)} score={group.teamGames[g]} />
        ))}
        <td className="px-2 py-1.5 text-center tabular-nums">
          {fmtScore(group.total)}
        </td>
        <td className="px-2 py-1.5 text-center tabular-nums">
          {fmtAvg(group.avg)}
        </td>
        <td className="px-2 py-1.5 text-center text-muted-foreground">
          {fmtPin(group.pinDiff)}
        </td>
      </tr>
    </>
  );
}

function Cell({
  locked,
  score,
}: {
  locked: boolean;
  score: number | undefined;
}) {
  if (!locked) {
    return (
      <td className="bg-muted/30 px-2 py-1.5 text-center text-muted-foreground">
        ·
      </td>
    );
  }
  return <td className="px-2 py-1.5 text-center">{score ?? "–"}</td>;
}

function MemberCell({
  locked,
  score,
  counted,
  team5,
}: {
  locked: boolean;
  score: number | undefined;
  counted: boolean;
  team5: boolean;
}) {
  if (!locked) {
    return (
      <td className="bg-muted/30 px-2 py-1.5 text-center text-muted-foreground">
        ·
      </td>
    );
  }
  if (score == null) {
    return <td className="px-2 py-1.5 text-center text-muted-foreground">–</td>;
  }
  // team5 미합산(교체 대기) 선수: 회색 + *
  if (team5 && !counted) {
    return (
      <td className="px-2 py-1.5 text-center text-muted-foreground/70">
        {score}
        <span className="ml-0.5 text-[10px]">*</span>
      </td>
    );
  }
  return <td className="px-2 py-1.5 text-center">{score}</td>;
}
