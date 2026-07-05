import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { computeAwards } from "@/lib/domain/awards";
import { createClient } from "@/lib/supabase/server";

import { AwardsBoard } from "./awards-board";

export const dynamic = "force-dynamic";

export default async function AwardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid)) notFound();

  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, venue, start_date, end_date")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) notFound();

  const groups = await computeAwards(supabase, tid);

  return (
    <div className="grid gap-6">
      <div className="print:hidden">
        <Link
          href={`/admin/tournaments/${tid}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {tournament.name}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          상장 출력
        </h2>
        <p className="text-sm text-muted-foreground">
          마감된 순위 데이터로 A4 상장을 자동 생성합니다. 대상을 선택하고
          문구를 확인한 뒤 인쇄하세요.
        </p>
      </div>

      <AwardsBoard
        tournamentName={tournament.name}
        venue={tournament.venue}
        endDate={tournament.end_date}
        groups={groups}
      />
    </div>
  );
}
