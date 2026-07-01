import Link from "next/link";
import { ChevronRight, Plus, Trophy } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/public/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TournamentStatus } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TournamentsListPage() {
  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments_with_status")
    .select("id, name, venue, start_date, end_date, status")
    .order("start_date", { ascending: false });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">대회 관리</h2>
          <p className="text-sm text-muted-foreground">
            대회를 만들고 종별·세부종목·레인을 설정합니다.
          </p>
        </div>
        <Link
          href="/admin/tournaments/new"
          className={cn(buttonVariants(), "gap-1")}
        >
          <Plus className="h-4 w-4" />새 대회
        </Link>
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="아직 등록된 대회가 없습니다."
          description="‘새 대회’를 눌러 첫 대회를 만들어보세요."
          action={
            <Link
              href="/admin/tournaments/new"
              className={cn(buttonVariants(), "gap-1")}
            >
              <Plus className="h-4 w-4" />새 대회
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {tournaments.map((t) => {
            const status = t.status as TournamentStatus;
            const isOngoing = status === "ongoing";
            return (
              <Link
                key={t.id}
                href={`/admin/tournaments/${t.id}`}
                className="group block"
              >
                <Card
                  className={cn(
                    "relative gap-0 overflow-hidden p-4 transition-all hover:shadow-md hover:-translate-y-0.5",
                    isOngoing ? "ring-primary/30" : "hover:ring-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      isOngoing
                        ? "bg-primary"
                        : status === "upcoming"
                          ? "bg-border"
                          : "bg-transparent",
                    )}
                  />
                  <div className="flex items-start justify-between gap-3 pl-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold leading-snug">
                        {t.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.venue}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                        {t.start_date} ~ {t.end_date}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
