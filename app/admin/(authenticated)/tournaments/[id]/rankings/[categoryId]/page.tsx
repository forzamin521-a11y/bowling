import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, ChevronLeft } from "lucide-react";

import { CategoryRankings } from "@/components/category-rankings";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
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
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground print:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
          {tournament.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {catLabel} 순위
          </h2>
          <div className="flex items-center gap-2 print:hidden">
            <Link
              href={`/admin/tournaments/${tid}/awards`}
              className={buttonVariants({ variant: "outline" }) + " gap-1.5"}
            >
              <Award className="h-4 w-4" />
              상장 출력
            </Link>
            <PrintButton label="순위표 인쇄" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground print:hidden">
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
