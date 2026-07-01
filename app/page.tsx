import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Trophy } from "lucide-react";

import { StatusBadge } from "@/components/public/status-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TournamentStatus } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { cn } from "@/lib/utils";

// 서울 CDN 엣지에서 캐시 서빙, 60초마다 백그라운드 재검증(ISR)
export const revalidate = 60;

const STATUS_ORDER: Record<TournamentStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  finished: 2,
};

export default async function PublicHome() {
  const supabase = createPublicClient();
  const { data: tournaments } = await supabase
    .from("tournaments_with_status")
    .select("id, name, venue, start_date, end_date, status")
    .order("start_date", { ascending: false });

  const sorted = (tournaments ?? []).slice().sort((a, b) => {
    const sa = STATUS_ORDER[a.status as TournamentStatus] ?? 9;
    const sb = STATUS_ORDER[b.status as TournamentStatus] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.start_date < b.start_date ? 1 : -1;
  });

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/[0.04] to-transparent">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                경기도볼링협회
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">대회 결과</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/admin"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              관리자
            </Link>
          </div>
        </header>

        {sorted.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-16 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              아직 등록된 대회가 없습니다.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sorted.map((t) => {
              const status = t.status as TournamentStatus;
              const isOngoing = status === "ongoing";
              const isUpcoming = status === "upcoming";

              const card = (
                <Card
                  className={cn(
                    "relative gap-0 overflow-hidden p-4 transition-all",
                    isUpcoming
                      ? "opacity-70"
                      : "hover:shadow-md hover:-translate-y-0.5",
                    isOngoing
                      ? "ring-primary/30"
                      : !isUpcoming && "hover:ring-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      isOngoing
                        ? "bg-primary"
                        : isUpcoming
                          ? "bg-border"
                          : "bg-transparent",
                    )}
                  />
                  <div className="flex items-start justify-between gap-3 pl-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold leading-snug">
                        {t.name}
                      </h2>
                      <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {t.venue}
                        </span>
                        <span className="flex items-center gap-1.5 tabular-nums">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                          {t.start_date} ~ {t.end_date}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={status} />
                      {isUpcoming ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          준비중
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      )}
                    </div>
                  </div>
                </Card>
              );

              // 예정 대회는 아직 클릭 불가 — 준비중 안내만 노출
              return isUpcoming ? (
                <div
                  key={t.id}
                  className="block cursor-not-allowed"
                  aria-disabled
                  title="아직 준비중인 대회입니다."
                >
                  {card}
                </div>
              ) : (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className="group block"
                >
                  {card}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
