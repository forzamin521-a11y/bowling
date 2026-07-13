"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requireActiveEvent } from "@/lib/supabase/category-guards";
import type { Database } from "@/lib/supabase/database.types";

export type SquadActionResult = { error?: string; message?: string };

const saveSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
  squadCount: z.coerce.number().int().min(1).max(8),
  players: z.array(
    z.object({
      playerId: z.coerce.number().int().positive(),
      squad: z.coerce.number().int().min(1).max(8),
    }),
  ),
});

export async function saveSquadAssignment(input: {
  tournamentId: number;
  eventId: number;
  squadCount: number;
  players: { playerId: number; squad: number }[];
}): Promise<SquadActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인해주세요." };

  const { tournamentId, eventId, squadCount, players } = parsed.data;
  const supabase = await createClient();

  const activeEvent = await requireActiveEvent(supabase, tournamentId, eventId);
  if ("error" in activeEvent) return { error: activeEvent.error };

  // 조 범위 검증
  if (players.some((p) => p.squad > squadCount)) {
    return { error: "조 범위를 벗어난 배정이 있습니다." };
  }

  // 마감된 게임이 있으면 재편성 차단 (잠긴 점수 고아화 방지)
  const { data: locked } = await supabase
    .from("game_states")
    .select("id")
    .eq("tournament_event_id", eventId)
    .eq("status", "locked")
    .limit(1);
  if ((locked ?? []).length > 0) {
    return {
      error: "이미 마감된 게임이 있어 조 재편성을 저장할 수 없습니다. 마감을 먼저 해제하세요.",
    };
  }

  // (player → squad) 맵
  const squadByPlayer = new Map<number, number>();
  for (const p of players) squadByPlayer.set(p.playerId, p.squad);

  // 기존 배정 전체 삭제 후 재생성
  const { error: delErr } = await supabase
    .from("event_squad_members")
    .delete()
    .eq("tournament_event_id", eventId);
  if (delErr) return { error: delErr.message };

  // squadCount=1 이면 멤버십 행 불필요 (전원 1조로 간주) — dormant 유지
  if (squadCount > 1 && squadByPlayer.size > 0) {
    const insertRows: Database["public"]["Tables"]["event_squad_members"]["Insert"][] =
      [...squadByPlayer.entries()].map(([pid, sq]) => ({
        tournament_event_id: eventId,
        tournament_player_id: pid,
        squad_number: sq,
      }));
    const { error: insErr } = await supabase
      .from("event_squad_members")
      .insert(insertRows);
    if (insErr) return { error: insErr.message };
  }

  // squad_count 갱신
  const { error: updErr } = await supabase
    .from("tournament_events")
    .update({ squad_count: squadCount })
    .eq("id", eventId);
  if (updErr) return { error: updErr.message };

  revalidatePath(`/admin/tournaments/${tournamentId}/events/${eventId}/squads`);
  revalidatePath(`/admin/tournaments/${tournamentId}/events/${eventId}/lanes`);
  return { message: "조 편성이 저장되었습니다." };
}
