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
import { groupKey } from "@/lib/domain/team-label";
import { createClient } from "@/lib/supabase/server";

import { RegistrationForm } from "./registration-form";
import { PlayersTable, type RegisteredPlayer } from "./players-table";

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isFinite(tid)) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: regions }] = await Promise.all([
    supabase.from("tournaments").select("id, name").eq("id", tid).maybeSingle(),
    supabase.from("regions").select("id, name").order("sort_order"),
  ]);

  if (!tournament) notFound();

  const { data: tpRows } = await supabase
    .from("tournament_players")
    .select(
      "id, player_id, player_number, team_label, region_id, affiliation_name",
    )
    .eq("tournament_id", tid)
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
          선수 등록
        </h2>
        <p className="text-sm text-muted-foreground">
          시/군 · 소속 단위로 선수를 등록합니다. 팀 라벨은 같은 소속 6명 단위로
          자동 부여됩니다.
        </p>
      </div>

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
            regions={regions ?? []}
            groupCounts={groupCounts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록된 선수</CardTitle>
          <CardDescription>총 {registered.length}명</CardDescription>
        </CardHeader>
        <CardContent>
          <PlayersTable
            tournamentId={tid}
            players={registered}
            regions={regions ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
