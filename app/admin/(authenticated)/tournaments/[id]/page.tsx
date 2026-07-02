import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { StatusBadge } from "@/components/public/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CATEGORY_AGE_ORDER,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
  TournamentStatus,
} from "@/lib/supabase/database.types";

import { TournamentForm } from "../tournament-form";

import { CategoriesSection } from "./categories-section";
import { DeleteTournamentButton } from "./delete-button";
import { EventsSection } from "./events-section";

export const dynamic = "force-dynamic";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid)) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: withStatus }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", tid).maybeSingle(),
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
    .eq("tournament_id", tid);

  const categoryIds = (categories ?? []).map((c) => c.id);
  const { data: events } = categoryIds.length
    ? await supabase
        .from("tournament_events")
        .select(
          "id, tournament_category_id, event_type, games_count, halftime_split_at, lane_move_direction, lane_move_offset, lane_start, lane_end",
        )
        .in("tournament_category_id", categoryIds)
    : { data: [] as const };

  // 종별별 정렬 + 그 안의 세부종목 묶기
  const sortedCategories = (categories ?? [])
    .slice()
    .sort((a, b) => {
      const ai = CATEGORY_AGE_ORDER.indexOf(a.age as CategoryAge);
      const bi = CATEGORY_AGE_ORDER.indexOf(b.age as CategoryAge);
      if (ai !== bi) return ai - bi;
      return (
        GENDER_ORDER.indexOf(a.gender as Gender) -
        GENDER_ORDER.indexOf(b.gender as Gender)
      );
    })
    .map((c) => ({
      id: c.id,
      age: c.age as CategoryAge,
      gender: c.gender as Gender,
      events: (events ?? [])
        .filter((e) => e.tournament_category_id === c.id)
        .map((e) => ({
          id: e.id,
          event_type: e.event_type as EventType,
          games_count: e.games_count,
          halftime_split_at: e.halftime_split_at,
          lane_move_direction: e.lane_move_direction as LaneMoveDirection,
          lane_move_offset: e.lane_move_offset,
          lane_start: e.lane_start,
          lane_end: e.lane_end,
        })),
    }));

  const status = (withStatus?.status ?? "upcoming") as TournamentStatus;

  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          대회 목록
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-semibold tracking-tight">
                {tournament.name}
              </h2>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">{tournament.venue}</p>
          </div>
          <DeleteTournamentButton
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>대회 기간·사용 레인·이동 규칙</CardDescription>
        </CardHeader>
        <CardContent>
          <TournamentForm mode="edit" initial={tournament} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>참가 종별</CardTitle>
          <CardDescription>
            이 대회에서 진행할 종별을 선택하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoriesSection
            tournamentId={tournament.id}
            categories={(categories ?? []).map((c) => ({
              id: c.id,
              age: c.age as CategoryAge,
              gender: c.gender as Gender,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>세부종목</CardTitle>
          <CardDescription>
            종별 안의 개인전 / 2인조 / 3인조 / 5인조와 게임 수를 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventsSection
            tournamentId={tournament.id}
            categories={sortedCategories}
          />
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>운영 단계</CardTitle>
          <CardDescription>
            선수 등록·레인 배정·점수 입력은 모두 위 “세부종목”의 각 종별 카드에서
            진행합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <li className="flex flex-1 items-center gap-3 rounded-lg border border-dashed p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                1
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  선수 등록
                </span>
                <span className="text-xs text-muted-foreground">
                  종별별 · 시/군·소속 단위
                </span>
              </span>
            </li>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 sm:block" />
            <li className="flex flex-1 items-center gap-3 rounded-lg border border-dashed p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                2
              </span>
              <span className="min-w-0">
                <span className="block font-medium">레인 배정</span>
                <span className="text-xs text-muted-foreground">
                  팀 편성 포함 · 세부종목별
                </span>
              </span>
            </li>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 sm:block" />
            <li className="flex flex-1 items-center gap-3 rounded-lg border border-dashed p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                3
              </span>
              <span className="min-w-0">
                <span className="block font-medium">점수 입력</span>
                <span className="text-xs text-muted-foreground">
                  게임 마감 시 순위 반영
                </span>
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
