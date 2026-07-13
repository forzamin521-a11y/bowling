import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_AGE_ORDER, GENDER_ORDER } from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function PlayersLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid)) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: categories }] = await Promise.all([
    supabase.from("tournaments").select("id, name").eq("id", tid).maybeSingle(),
    supabase
      .from("tournament_categories")
      .select("id, age, gender")
      .eq("tournament_id", tid)
      .eq("is_active", true),
  ]);

  if (!tournament) notFound();

  const sorted = (categories ?? []).slice().sort((a, b) => {
    const ai = CATEGORY_AGE_ORDER.indexOf(a.age as CategoryAge);
    const bi = CATEGORY_AGE_ORDER.indexOf(b.age as CategoryAge);
    if (ai !== bi) return ai - bi;
    return (
      GENDER_ORDER.indexOf(a.gender as Gender) -
      GENDER_ORDER.indexOf(b.gender as Gender)
    );
  });

  // 종별 탭이 페이지 안에서 전환을 담당하므로 첫 종별로 바로 이동
  if (sorted.length > 0) {
    redirect(`/admin/tournaments/${tid}/players/${sorted[0].id}`);
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href={`/admin/tournaments/${tid}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {tournament.name}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">선수 등록</h2>
      </div>

      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          먼저 대회 상세에서 참가 종별을 선택하세요.
        </CardContent>
      </Card>
    </div>
  );
}
