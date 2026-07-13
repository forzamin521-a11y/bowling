import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Users,
} from "lucide-react";

import { StatusBadge } from "@/components/public/status-badge";
import { buttonVariants } from "@/components/ui/button";
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
    .select("id, age, gender, is_active")
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

  const eventIds = (events ?? []).map((e) => e.id);
  const [{ data: playerCategoryRows }, { data: scoreEventRows }] =
    await Promise.all([
      categoryIds.length
        ? supabase
            .from("tournament_players")
            .select("tournament_category_id")
            .in("tournament_category_id", categoryIds)
        : Promise.resolve({ data: [] as const }),
      eventIds.length
        ? supabase
            .from("scores")
            .select("tournament_event_id")
            .in("tournament_event_id", eventIds)
        : Promise.resolve({ data: [] as const }),
    ]);

  const playerCountByCategory = new Map<number, number>();
  for (const row of playerCategoryRows ?? []) {
    playerCountByCategory.set(
      row.tournament_category_id,
      (playerCountByCategory.get(row.tournament_category_id) ?? 0) + 1,
    );
  }

  const eventCategoryById = new Map(
    (events ?? []).map((event) => [event.id, event.tournament_category_id]),
  );
  const scoreCountByCategory = new Map<number, number>();
  for (const row of scoreEventRows ?? []) {
    const categoryId = eventCategoryById.get(row.tournament_event_id);
    if (categoryId === undefined) continue;
    scoreCountByCategory.set(
      categoryId,
      (scoreCountByCategory.get(categoryId) ?? 0) + 1,
    );
  }

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
      is_active: c.is_active,
      player_count: playerCountByCategory.get(c.id) ?? 0,
      event_count: (events ?? []).filter(
        (event) => event.tournament_category_id === c.id,
      ).length,
      score_count: scoreCountByCategory.get(c.id) ?? 0,
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
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tournaments/${tournament.id}/awards`}
              className={buttonVariants({ variant: "outline" }) + " gap-1.5"}
            >
              <Award className="h-4 w-4" />
              상장 출력
            </Link>
            <DeleteTournamentButton
              tournamentId={tournament.id}
              tournamentName={tournament.name}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>
            <span className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
              <span className="flex items-center gap-1.5 tabular-nums">
                <CalendarDays className="h-3.5 w-3.5" />
                {tournament.start_date} ~ {tournament.end_date}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {tournament.venue}
              </span>
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 수정 폼은 평소에 접어둬 화면을 차지하지 않는다 */}
          <details className="group">
            <summary className="flex w-fit cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
              <Pencil className="h-3.5 w-3.5" />
              기본 정보 수정
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 border-t pt-4">
              <TournamentForm mode="edit" initial={tournament} />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>참가 종별</CardTitle>
          <CardDescription>
            이 대회에서 사용할 종별을 선택하세요. 사용 중지해도 등록 데이터는
            보존됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoriesSection
            tournamentId={tournament.id}
            categories={(categories ?? []).map((c) => ({
              id: c.id,
              age: c.age as CategoryAge,
              gender: c.gender as Gender,
              isActive: c.is_active,
              playerCount: playerCountByCategory.get(c.id) ?? 0,
              eventCount: (events ?? []).filter(
                (event) => event.tournament_category_id === c.id,
              ).length,
              scoreCount: scoreCountByCategory.get(c.id) ?? 0,
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
            categories={sortedCategories.filter((category) => category.is_active)}
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
