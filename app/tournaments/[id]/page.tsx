import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, MapPin } from "lucide-react";

import { Breadcrumb } from "@/components/breadcrumb";
import { StatusBadge } from "@/components/public/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CATEGORY_AGE_LABEL,
  CATEGORY_AGE_ORDER,
  GENDER_LABEL,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  CategoryAge,
  Gender,
  TournamentStatus,
} from "@/lib/supabase/database.types";

export const revalidate = 60;

export default async function PublicTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid)) notFound();

  const supabase = createPublicClient();
  const [{ data: tournament }, { data: withStatus }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, venue, start_date, end_date")
      .eq("id", tid)
      .maybeSingle(),
    supabase
      .from("tournaments_with_status")
      .select("status")
      .eq("id", tid)
      .maybeSingle(),
  ]);
  if (!tournament) notFound();

  const { data: categories } = await supabase
    .from("tournament_categories")
    .select("id, age, gender")
    .eq("tournament_id", tid)
    .eq("is_active", true);

  const status = (withStatus?.status ?? "upcoming") as TournamentStatus;

  const sorted = (categories ?? []).slice().sort((a, b) => {
    const ai = CATEGORY_AGE_ORDER.indexOf(a.age as CategoryAge);
    const bi = CATEGORY_AGE_ORDER.indexOf(b.age as CategoryAge);
    if (ai !== bi) return ai - bi;
    return (
      GENDER_ORDER.indexOf(a.gender as Gender) -
      GENDER_ORDER.indexOf(b.gender as Gender)
    );
  });

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/[0.04] to-transparent">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Breadcrumb
          items={[
            { label: "대회 목록", href: "/" },
            { label: tournament.name },
          ]}
        />
        <div className="mt-3 mb-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {tournament.name}
            </h1>
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {tournament.venue}
            </span>
            <span className="text-border">·</span>
            <span className="tabular-nums">
              {tournament.start_date} ~ {tournament.end_date}
            </span>
          </p>
        </div>

        {status === "upcoming" ? (
          <Card className="flex flex-col items-center gap-2 py-16 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">준비중인 대회입니다.</p>
            <p className="text-sm text-muted-foreground">
              대회가 시작되면 종별과 경기 결과를 확인하실 수 있습니다.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">종별</CardTitle>
                <CardDescription>
                  종별을 선택하면 세부종목별 순위와 개인종합·종합집계를 볼 수
                  있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sorted.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    등록된 종별이 없습니다.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sorted.map((c) => (
                      <Link
                        key={c.id}
                        href={`/tournaments/${tid}/${c.id}`}
                        className="group flex items-center justify-between rounded-lg border px-3.5 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                      >
                        <span className="font-medium">
                          {CATEGORY_AGE_LABEL[c.age as CategoryAge]}{" "}
                          {GENDER_LABEL[c.gender as Gender]}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
