import {
  CategoryRankingsTabs,
  type RankingTab,
} from "@/components/category-rankings-tabs";
import { MedalTallyView } from "@/components/medal-tally-view";
import { OverallRankingsView } from "@/components/overall-rankings-view";
import { RankingTable } from "@/components/public/ranking-table";
import { computeEventRanking } from "@/lib/domain/event-ranking";
import { EVENT_TYPE_LABEL, EVENT_TYPE_ORDER } from "@/lib/domain/labels";
import { computeMedalTally } from "@/lib/domain/medal-tally";
import { computeOverallRankings } from "@/lib/domain/overall-rankings";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/supabase/database.types";

function fmtDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if ([s, e].some((d) => Number.isNaN(d.getTime()))) return "";
  const startStr = `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일`;
  if (start === end) return startStr;
  const sameMonth =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const endStr = sameMonth
    ? `${e.getDate()}일`
    : `${e.getMonth() + 1}월 ${e.getDate()}일`;
  return `${startStr} ~ ${endStr}`;
}

/**
 * 한 종별의 순위 탭 묶음 (관리자/공개 공용).
 * 개인/2인조/3인조/5인조(존재하는 종목만) + 개인종합 + 종합집계.
 * 마감된 게임만 반영된다.
 */
export async function CategoryRankings({
  tournamentId,
  categoryId,
  tournamentName,
  categoryLabel,
  startDate,
  endDate,
}: {
  tournamentId: number;
  categoryId: number;
  tournamentName: string;
  categoryLabel: string;
  startDate: string;
  endDate: string;
}) {
  const supabase = await createClient();

  const { data: eventRows } = await supabase
    .from("tournament_events")
    .select("id, event_type")
    .eq("tournament_category_id", categoryId);

  // 종목유형별 대표 종목 (중복 시 첫 종목)
  const eventIdByType = new Map<EventType, number>();
  for (const e of eventRows ?? []) {
    const t = e.event_type as EventType;
    if (!eventIdByType.has(t)) eventIdByType.set(t, e.id);
  }
  const orderedTypes = EVENT_TYPE_ORDER.filter((t) => eventIdByType.has(t));

  const [eventRankings, overall, tally] = await Promise.all([
    Promise.all(
      orderedTypes.map(async (t) => {
        const eid = eventIdByType.get(t)!;
        return { type: t, eid, data: await computeEventRanking(supabase, eid) };
      }),
    ),
    computeOverallRankings(supabase, tournamentId, categoryId),
    computeMedalTally(supabase, tournamentId, categoryId),
  ]);

  const tabs: RankingTab[] = [];

  // 세부종목 탭 (개인/2인조/3인조/5인조)
  for (const er of eventRankings) {
    if (!er.data) continue;
    tabs.push({
      value: er.type,
      label: EVENT_TYPE_LABEL[er.type],
      content: (
        <RankingTable
          eventId={er.eid}
          eventType={er.data.eventType}
          gamesCount={er.data.gamesCount}
          lockedGames={er.data.lockedGames}
          individualRows={er.data.individualRows}
          teamGroups={er.data.teamGroups}
          regionsPresent={er.data.regionsPresent}
        />
      ),
    });
  }

  // 개인종합 탭
  if (overall) {
    tabs.push({
      value: "overall",
      label: "개인종합",
      content: <OverallRankingsView categories={overall.categories} />,
    });
  }

  // 종합집계 탭 (메달현황 + 팀 종합순위)
  // 마감된 종목이 하나라도 있으면 그 종목만 먼저 표시한다.
  if (tally) {
    const cat = tally.categories[0];
    const anyFinished = cat?.anyFinished ?? false;
    const allFinished = cat?.allFinished ?? false;
    tabs.push({
      value: "medals",
      label: "종합집계",
      content: anyFinished ? (
        <div className="grid gap-4">
          <div className="rounded-lg border bg-card px-4 py-5 text-center">
            <p className="text-lg font-bold tracking-tight">{tournamentName}</p>
            <p className="mt-1 text-base font-semibold">
              {categoryLabel} 종합집계표
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {fmtDateRange(startDate, endDate)}
            </p>
            {!allFinished && (
              <p className="mt-2 text-xs text-muted-foreground">
                일부 종목은 아직 진행 중입니다. 마감된 종목만 집계에
                반영됩니다.
              </p>
            )}
          </div>
          <MedalTallyView tally={tally} />
        </div>
      ) : undefined,
      notReady: anyFinished
        ? undefined
        : {
            title: "집계 준비 중",
            description:
              "이 종별의 세부종목이 하나라도 마감되면 마감된 종목부터 메달현황이 표시됩니다.",
          },
    });
  }

  return <CategoryRankingsTabs tabs={tabs} />;
}
