import { Medal } from "lucide-react";

import { RankMedal, podiumRowClass } from "@/components/public/rank-medal";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT_TYPE_LABEL } from "@/lib/domain/labels";
import type {
  CategoryMedals,
  MedalRowType,
  MedalTally,
} from "@/lib/domain/medal-tally";
import type { EventType } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

function rowLabel(type: MedalRowType) {
  return type === "overall" ? "개인종합" : EVENT_TYPE_LABEL[type as EventType];
}

function placeLabel(rank: number) {
  if (rank === 1) return "우승";
  if (rank === 2) return "준우승";
  return `${rank}위`;
}

const MEDAL_COLS: { key: string; label: string; dot: string }[] = [
  { key: "gold", label: "금", dot: "bg-gold" },
  { key: "silver", label: "은", dot: "bg-silver" },
  { key: "bronze", label: "동", dot: "bg-bronze" },
  { key: "fourth", label: "4위", dot: "bg-muted-foreground/30" },
];

function MedalHeaderCell({ label, dot }: { label: string; dot: string }) {
  return (
    <th className="px-2 py-2 text-center font-medium">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-black/10", dot)} />
        {label}
      </span>
    </th>
  );
}

function CategoryBlock({ category }: { category: CategoryMedals }) {
  const hasData = category.rows.length > 0;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">{category.label}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!hasData ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            아직 집계된 메달이 없습니다.
          </p>
        ) : (
          <>
            {/* 종목별 메달현황 */}
            <section className="grid gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <Medal className="h-4 w-4 text-gold" />
                종목별 메달현황
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">종목</th>
                      {MEDAL_COLS.map((c) => (
                        <MedalHeaderCell key={c.key} label={c.label} dot={c.dot} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {category.rows.map((row) => (
                      <tr
                        key={row.type}
                        className="border-b last:border-0 transition-colors hover:bg-accent/40"
                      >
                        <td className="px-2 py-2 font-medium whitespace-nowrap">
                          {rowLabel(row.type)}
                        </td>
                        {row.finished ? (
                          row.places.map((team, i) => (
                            <td key={i} className="px-2 py-2 text-center">
                              {team ? (
                                <span
                                  className={cn(
                                    "inline-block",
                                    i === 0 && "font-semibold",
                                  )}
                                >
                                  {team}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </td>
                          ))
                        ) : (
                          <td
                            colSpan={MEDAL_COLS.length}
                            className="px-2 py-2 text-center text-xs text-muted-foreground"
                          >
                            집계 중
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 팀 종합순위 */}
            {category.standings.length > 0 && (
              <section className="grid gap-2">
                <h4 className="text-sm font-semibold">팀 종합순위</h4>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="px-2 py-2 text-center font-medium">순위</th>
                        <th className="px-2 py-2 text-left font-medium">팀명</th>
                        {MEDAL_COLS.map((c) => (
                          <MedalHeaderCell
                            key={c.key}
                            label={c.label}
                            dot={c.dot}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {category.standings.map((s) => (
                        <tr
                          key={s.team}
                          className={cn(
                            "border-b last:border-0",
                            podiumRowClass(s.rank),
                          )}
                        >
                          <td className="px-2 py-2 text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <RankMedal rank={s.rank} />
                              <span
                                className={cn(
                                  "text-xs",
                                  s.rank <= 3
                                    ? "font-semibold"
                                    : "text-muted-foreground",
                                )}
                              >
                                {placeLabel(s.rank)}
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-2 font-medium">{s.team}</td>
                          <MedalCount n={s.gold} />
                          <MedalCount n={s.silver} />
                          <MedalCount n={s.bronze} />
                          <MedalCount n={s.fourth} muted />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MedalCount({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <td className="px-2 py-2 text-center tabular-nums">
      {n > 0 ? (
        <span className={cn("font-semibold", muted && "text-muted-foreground")}>
          {n}
        </span>
      ) : (
        <span className="text-muted-foreground/40">·</span>
      )}
    </td>
  );
}

export function MedalTallyView({ tally }: { tally: MedalTally }) {
  if (tally.categories.length === 0) {
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
      {tally.categories.map((c) => (
        <CategoryBlock key={c.id} category={c} />
      ))}
    </>
  );
}
