import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Breadcrumb } from "@/components/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  categoryFullLabel,
  EVENT_TYPE_LABEL,
} from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type {
  CategoryAge,
  EventType,
  Gender,
} from "@/lib/supabase/database.types";

import { SquadBoard, type SquadPlayer } from "./squad-board";

export const dynamic = "force-dynamic";

export default async function SquadsPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;
  const tid = Number(id);
  const eid = Number(eventId);
  if (!Number.isFinite(tid) || !Number.isFinite(eid)) notFound();

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("tournament_events")
    .select(
      "id, tournament_category_id, event_type, lane_start, lane_end, squad_count",
    )
    .eq("id", eid)
    .maybeSingle();
  if (!event) notFound();

  const { data: category } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id, age, gender")
    .eq("id", event.tournament_category_id)
    .maybeSingle();
  if (!category || category.tournament_id !== tid) notFound();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, settings")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) notFound();

  const eventType = event.event_type as EventType;
  const headerLabel = `${categoryFullLabel(
    category.age as CategoryAge,
    category.gender as Gender,
  )} · ${EVENT_TYPE_LABEL[eventType]}`;

  const lanesHref = `/admin/tournaments/${tid}/events/${eid}/lanes`;

  const header = (
    <div className="flex flex-col gap-3">
      <Breadcrumb
        items={[
          { label: "대회 목록", href: "/admin/tournaments" },
          { label: tournament.name, href: `/admin/tournaments/${tid}` },
          { label: "조 편성" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">조 편성</h2>
          <p className="text-sm text-muted-foreground">{headerLabel}</p>
        </div>
        <Link
          href={lanesHref}
          className={cn(buttonVariants(), "sm:shrink-0")}
        >
          레인 배정
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </div>
  );

  if (event.lane_start == null || event.lane_end == null) {
    return (
      <div className="grid max-w-3xl gap-6">
        {header}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            이 세부종목에 사용 레인이 설정되지 않았습니다. 대회 상세에서 세부종목
            사용 레인을 먼저 지정하세요.
          </CardContent>
        </Card>
      </div>
    );
  }

  // 참가 선수 + 이름/시군
  const [{ data: tpRows }, { data: regions }] = await Promise.all([
    supabase
      .from("tournament_players")
      .select("id, player_id, player_number, region_id, affiliation_name")
      .eq("tournament_id", tid)
      .eq("tournament_category_id", category.id)
      .order("player_number"),
    supabase.from("regions").select("id, name"),
  ]);
  const rows = tpRows ?? [];
  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("players").select("id, name").in("id", playerIds)
    : { data: [] as { id: number; name: string }[] };
  const nameById = new Map((playerRows ?? []).map((p) => [p.id, p.name]));
  const regionById = new Map((regions ?? []).map((r) => [r.id, r.name]));

  // 이 세부종목의 팀 + 멤버
  const { data: teamRows } = await supabase
    .from("tournament_teams")
    .select("id, region_id, affiliation_name, team_label, team_seq")
    .eq("tournament_event_id", eid)
    .order("team_label")
    .order("team_seq");
  const teamList = teamRows ?? [];
  const teamIds = teamList.map((t) => t.id);

  const { data: memberRows } = teamIds.length
    ? await supabase
        .from("tournament_team_members")
        .select("tournament_team_id, tournament_player_id")
        .in("tournament_team_id", teamIds)
    : { data: [] as {
        tournament_team_id: number;
        tournament_player_id: number;
      }[] };
  const teamIdByPlayer = new Map(
    (memberRows ?? []).map((m) => [m.tournament_player_id, m.tournament_team_id]),
  );
  const labelByTeam = new Map(
    teamList.map((t) => [
      t.id,
      `${regionById.get(t.region_id) ?? ""} ${t.affiliation_name} ${t.team_label}${
        t.team_seq > 1 ? `-${t.team_seq}` : ""
      }`,
    ]),
  );

  // 번호순 분할용 평면 선수 목록
  const players: SquadPlayer[] = rows.map((r) => {
    const teamId = teamIdByPlayer.get(r.id) ?? null;
    return {
      id: r.id,
      number: r.player_number,
      name: nameById.get(r.player_id) ?? "",
      teamId,
      teamLabel: teamId != null ? (labelByTeam.get(teamId) ?? null) : null,
    };
  });

  // 저장된 조 배정 → 초기 번호 구간 (조별 최소~최대 번호)
  const numberById = new Map(rows.map((r) => [r.id, r.player_number]));
  let initialRanges: { from: number; to: number }[] | null = null;
  if (event.squad_count > 1) {
    const { data: esmRows } = await supabase
      .from("event_squad_members")
      .select("tournament_player_id, squad_number")
      .eq("tournament_event_id", eid);
    if ((esmRows ?? []).length > 0) {
      const minMax = new Map<number, { from: number; to: number }>();
      for (const r of esmRows ?? []) {
        const n = numberById.get(r.tournament_player_id);
        if (n == null) continue;
        const cur = minMax.get(r.squad_number);
        if (!cur) minMax.set(r.squad_number, { from: n, to: n });
        else {
          cur.from = Math.min(cur.from, n);
          cur.to = Math.max(cur.to, n);
        }
      }
      initialRanges = Array.from({ length: event.squad_count }, (_, i) =>
        minMax.get(i + 1) ?? { from: 0, to: 0 },
      );
    }
  }

  // 마감된 게임이 있으면 재분반 차단 안내
  const { data: lockedRows } = await supabase
    .from("game_states")
    .select("id")
    .eq("tournament_event_id", eid)
    .eq("status", "locked")
    .limit(1);
  const hasLockedGame = (lockedRows ?? []).length > 0;

  return (
    <div className="grid max-w-6xl gap-6">
      {header}
      <SquadBoard
        tournamentId={tid}
        eventId={eid}
        initialSquadCount={event.squad_count}
        initialRanges={initialRanges}
        players={players}
        hasLockedGame={hasLockedGame}
      />
    </div>
  );
}
