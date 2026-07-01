import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/breadcrumb";
import { CategoryRankings } from "@/components/category-rankings";
import { categoryFullLabel } from "@/lib/domain/labels";
import { createPublicClient } from "@/lib/supabase/public";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

export const revalidate = 60;

export default async function PublicCategoryPage({
  params,
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const { id, categoryId } = await params;
  const tid = Number(id);
  const cid = Number(categoryId);
  if (!Number.isFinite(tid) || !Number.isFinite(cid)) notFound();

  const supabase = createPublicClient();

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
    <div className="min-h-dvh bg-gradient-to-b from-primary/[0.04] to-transparent">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Breadcrumb
          items={[
            { label: "대회 목록", href: "/" },
            { label: tournament.name, href: `/tournaments/${tid}` },
            { label: catLabel },
          ]}
        />
        <h1 className="mt-3 mb-5 text-2xl font-bold tracking-tight">
          {catLabel}
        </h1>

        <CategoryRankings
          tournamentId={tid}
          categoryId={cid}
          tournamentName={tournament.name}
          categoryLabel={catLabel}
          startDate={tournament.start_date}
          endDate={tournament.end_date}
        />
      </div>
    </div>
  );
}
