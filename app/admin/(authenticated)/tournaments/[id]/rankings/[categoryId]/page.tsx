import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CategoryRankings } from "@/components/category-rankings";
import { categoryFullLabel } from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function CategoryRankingsPage({
  params,
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const { id, categoryId } = await params;
  const tid = Number(id);
  const cid = Number(categoryId);
  if (![tid, cid].every(Number.isFinite)) notFound();

  const supabase = await createClient();

  const { data: category } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id, age, gender")
    .eq("id", cid)
    .maybeSingle();
  if (!category || category.tournament_id !== tid) notFound();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, start_date, end_date")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) notFound();

  const catLabel = categoryFullLabel(
    category.age as CategoryAge,
    category.gender as Gender,
  );

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
          {catLabel} 순위
        </h2>
        <p className="text-sm text-muted-foreground">
          세부종목별 순위와 개인종합·종합집계입니다. 마감된 게임만 반영됩니다.
        </p>
      </div>

      <CategoryRankings
        tournamentId={tid}
        categoryId={cid}
        tournamentName={tournament.name}
        categoryLabel={catLabel}
        startDate={tournament.start_date}
        endDate={tournament.end_date}
      />
    </div>
  );
}
