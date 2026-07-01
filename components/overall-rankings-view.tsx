import { RankMedal, podiumRowClass } from "@/components/public/rank-medal";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT_TYPE_LABEL } from "@/lib/domain/labels";
import type { OverallCategory } from "@/lib/domain/overall-rankings";
import { cn, fmtAvg, fmtScore } from "@/lib/utils";

function fmtAvgFromTotal(total: number, games: number) {
  return games > 0 ? fmtAvg(total / games) : "–";
}

/**
 * 종별 종합 순위 표 (관리자/공개 공용).
 * 데이터는 computeOverallRankings 로 계산해서 넘긴다.
 */
export function OverallRankingsView({
  categories,
}: {
  categories: OverallCategory[];
}) {
  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          등록된 종별이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {categories.map((c) => {
        const firstTotal = c.rows.length ? c.rows[0].total : 0;
        return (
          <Card key={c.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-base">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {c.rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  아직 집계된 순위가 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="sticky left-0 z-10 bg-muted px-2 py-2 text-center font-medium">
                          순위
                        </th>
                        <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">
                          번호
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          시/군
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          소속
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          이름
                        </th>
                        {c.types.map((t) => (
                          <th
                            key={t}
                            className="px-2 py-2 text-center font-medium"
                          >
                            {EVENT_TYPE_LABEL[t]}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-medium">
                          게임수
                        </th>
                        <th className="px-2 py-2 text-center font-semibold text-foreground">
                          Total
                        </th>
                        <th className="px-2 py-2 text-center font-medium">
                          평균
                        </th>
                        <th className="hidden px-2 py-2 text-center font-medium sm:table-cell">
                          핀차
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((row, i) => {
                        const rank = i + 1;
                        const pinDiff = row.total - firstTotal;
                        return (
                          <tr
                            key={row.tpId}
                            className={cn(
                              "border-b last:border-0",
                              podiumRowClass(rank),
                            )}
                          >
                            <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-center">
                              <RankMedal rank={rank} />
                            </td>
                            <td className="hidden px-2 py-1.5 text-center font-mono text-xs text-muted-foreground sm:table-cell">
                              {row.playerNumber || ""}
                            </td>
                            <td className="px-2 py-1.5">{row.regionName}</td>
                            <td className="px-2 py-1.5">
                              {row.affiliationName}
                            </td>
                            <td className="px-2 py-1.5 font-medium">
                              {row.name}
                            </td>
                            {c.types.map((t) => {
                              const bt = row.byType[t];
                              return (
                                <td
                                  key={t}
                                  className="px-2 py-1.5 text-center tabular-nums"
                                >
                                  {bt && bt.games > 0 ? (
                                    fmtScore(bt.total)
                                  ) : (
                                    <span className="text-muted-foreground">
                                      –
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1.5 text-center text-muted-foreground">
                              {row.games}
                            </td>
                            <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                              {fmtScore(row.total)}
                            </td>
                            <td className="px-2 py-1.5 text-center tabular-nums">
                              {fmtAvgFromTotal(row.total, row.games)}
                            </td>
                            <td className="hidden px-2 py-1.5 text-center text-muted-foreground tabular-nums sm:table-cell">
                              {pinDiff === 0 ? "0" : fmtScore(pinDiff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
