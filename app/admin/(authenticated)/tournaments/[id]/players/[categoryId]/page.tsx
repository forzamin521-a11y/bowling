import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  categoryFullLabel,
  CATEGORY_AGE_ORDER,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import { groupKey } from "@/lib/domain/team-label";
import { createClient } from "@/lib/supabase/server";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

import { CategoryTabs, type CategoryTab } from "../category-tabs";
import { RegistrationForm } from "../registration-form";
import { PlayersTable, type RegisteredPlayer } from "../players-table";

export const dynamic = "force-dynamic";

export default async function CategoryPlayersPage({
  params,
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const { id, categoryId } = await params;
  const tid = Number(id);
  const cid = Number(categoryId);
  if (!Number.isFinite(tid) || !Number.isFinite(cid)) notFound();

  const supabase = await createClient();

  const [
    { data: tournament },
    { data: category },
    { data: allCategories },
    { data: allTpRows },
    { data: regions },
  ] = await Promise.all([
    supabase.from("tournaments").select("id, name").eq("id", tid).maybeSingle(),
    supabase
      .from("tournament_categories")
      .select("id, tournament_id, age, gender")
      .eq("id", cid)
      .maybeSingle(),
    supabase
      .from("tournament_categories")
      .select("id, age, gender")
      .eq("tournament_id", tid),
    supabase
      .from("tournament_players")
      .select("tournament_category_id")
      .eq("tournament_id", tid),
    supabase.from("regions").select("id, name").order("sort_order"),
  ]);

  if (!tournament) notFound();
  if (!category || category.tournament_id !== tid) notFound();

  const categoryLabel = categoryFullLabel(
    category.age as CategoryAge,
    category.gender as Gender,
  );

  // 종별 탭 (등록 인원 표시)
  const countByCategory = new Map<number, number>();
  for (const r of allTpRows ?? []) {
    countByCategory.set(
      r.tournament_category_id,
      (countByCategory.get(r.tournament_category_id) ?? 0) + 1,
    );
  }
  const categoryTabs: CategoryTab[] = (allCategories ?? [])
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
      count: countByCategory.get(c.id) ?? 0,
    }));

  const { data: tpRows } = await supabase
    .from("tournament_players")
    .select(
      "id, player_id, player_number, team_label, region_id, affiliation_name",
    )
    .eq("tournament_id", tid)
    .eq("tournament_category_id", cid)
    .order("player_number");

  const rows = tpRows ?? [];
  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("players").select("id, name").in("id", playerIds)
    : { data: [] as { id: number; name: string }[] };

  const nameById = new Map((playerRows ?? []).map((p) => [p.id, p.name]));
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  const registered: RegisteredPlayer[] = rows.map((r) => ({
    id: r.id,
    masterPlayerId: r.player_id,
    playerNumber: r.player_number,
    teamLabel: r.team_label,
    regionId: r.region_id,
    regionName: regionById.get(r.region_id) ?? "",
    affiliationName: r.affiliation_name,
    name: nameById.get(r.player_id) ?? "",
  }));

  const groupCounts: Record<string, number> = {};
  for (const r of registered) {
    const k = groupKey(r.regionId, r.affiliationName);
    groupCounts[k] = (groupCounts[k] ?? 0) + 1;
  }

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <Link
          href={`/admin/tournaments/${tid}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {tournament.name}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          선수 등록 · {categoryLabel}
        </h2>
        <p className="text-sm text-muted-foreground">
          이 종별에 시/군 · 소속 단위로 선수를 등록합니다. 팀 라벨은 같은 종별
          내 같은 소속 6명 단위로 자동 부여됩니다.
        </p>
      </div>

      <CategoryTabs
        tournamentId={tid}
        categories={categoryTabs}
        activeId={cid}
      />

      <Card>
        <CardHeader>
          <CardTitle>새 선수 등록</CardTitle>
          <CardDescription>
            시/군과 소속을 정하고 선수명을 여러 명 한 번에 입력하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrationForm
            tournamentId={tid}
            categoryId={cid}
            regions={regions ?? []}
            groupCounts={groupCounts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록된 선수</CardTitle>
          <CardDescription>
            {categoryLabel} · 총 {registered.length}명
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlayersTable
            tournamentId={tid}
            categoryId={cid}
            players={registered}
            regions={regions ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
