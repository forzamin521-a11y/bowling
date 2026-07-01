import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { StatusBadge } from "@/components/public/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { TournamentStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ data: tournaments }, { count: playerCount }] = await Promise.all([
    supabase
      .from("tournaments_with_status")
      .select("id, name, venue, start_date, end_date, status")
      .order("start_date", { ascending: false }),
    supabase.from("players").select("id", { count: "exact", head: true }),
  ]);

  const list = tournaments ?? [];
  const counts: Record<TournamentStatus, number> = {
    ongoing: 0,
    upcoming: 0,
    finished: 0,
  };
  for (const t of list) {
    counts[t.status as TournamentStatus] += 1;
  }

  const stats: {
    key: TournamentStatus | "players";
    title: string;
    description: string;
    value: number;
    accent: string;
    valueClass: string;
  }[] = [
    {
      key: "ongoing",
      title: "진행 중 대회",
      description: "오늘 진행 중",
      value: counts.ongoing,
      accent: "bg-primary",
      valueClass: counts.ongoing > 0 ? "text-primary" : "",
    },
    {
      key: "upcoming",
      title: "예정 대회",
      description: "곧 시작될 대회",
      value: counts.upcoming,
      accent: "bg-chart-2",
      valueClass: "",
    },
    {
      key: "finished",
      title: "종료된 대회",
      description: "기간이 지난 대회",
      value: counts.finished,
      accent: "bg-muted-foreground/30",
      valueClass: "",
    },
    {
      key: "players",
      title: "등록 선수(누적)",
      description: "마스터 선수 수",
      value: playerCount ?? 0,
      accent: "bg-amber-500",
      valueClass: "",
    },
  ];

  const recent = list.slice(0, 6);

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">대시보드</h2>
        <p className="text-sm text-muted-foreground">
          진행 중·예정·종료 대회와 빠른 작업을 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.key} className="relative gap-3 overflow-hidden">
            <span className={cn("absolute inset-x-0 top-0 h-1", s.accent)} />
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.title}
              </CardTitle>
              <CardDescription className="text-xs">
                {s.description}
              </CardDescription>
            </CardHeader>
            <CardContent
              className={cn(
                "text-3xl font-bold tabular-nums",
                s.valueClass,
              )}
            >
              {s.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 대회</CardTitle>
          <CardDescription>최신 등록순</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              아직 등록된 대회가 없습니다.
            </p>
          ) : (
            <div className="grid gap-2">
              {recent.map((t) => {
                const status = t.status as TournamentStatus;
                return (
                  <Link
                    key={t.id}
                    href={`/admin/tournaments/${t.id}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 text-muted-foreground tabular-nums">
                        {t.start_date} ~ {t.end_date}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
