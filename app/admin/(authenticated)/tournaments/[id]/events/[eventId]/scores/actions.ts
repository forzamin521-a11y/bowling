"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ScoreActionResult = { error?: string; message?: string };

function scoresPath(tournamentId: number, eventId: number) {
  return `/admin/tournaments/${tournamentId}/events/${eventId}/scores`;
}

/* ─────────── 점수 셀 저장 ─────────── */

const upsertSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
  squadNumber: z.coerce.number().int().min(1).max(8).default(1),
  tournamentPlayerId: z.coerce.number().int().positive(),
  gameNumber: z.coerce.number().int().min(1).max(12),
  score: z.union([z.coerce.number().int().min(0).max(300), z.null()]),
});

export async function upsertScore(input: {
  tournamentId: number;
  eventId: number;
  squadNumber?: number;
  tournamentPlayerId: number;
  gameNumber: number;
  score: number | null;
}): Promise<ScoreActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { error: "점수는 0~300 사이 정수여야 합니다." };

  const { eventId, squadNumber, tournamentPlayerId, gameNumber, score } =
    parsed.data;
  const supabase = await createClient();

  // 마감된 게임은 수정 불가 (이 선수 조 기준)
  const { data: gs } = await supabase
    .from("game_states")
    .select("status")
    .eq("tournament_event_id", eventId)
    .eq("squad_number", squadNumber)
    .eq("game_number", gameNumber)
    .maybeSingle();
  if (gs?.status === "locked") {
    return { error: "마감된 게임은 수정할 수 없습니다." };
  }

  if (score === null) {
    const { error } = await supabase
      .from("scores")
      .delete()
      .eq("tournament_event_id", eventId)
      .eq("tournament_player_id", tournamentPlayerId)
      .eq("game_number", gameNumber);
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await supabase.from("scores").upsert(
    {
      tournament_event_id: eventId,
      tournament_player_id: tournamentPlayerId,
      game_number: gameNumber,
      score,
    },
    { onConflict: "tournament_event_id,tournament_player_id,game_number" },
  );
  if (error) return { error: error.message };
  return {};
}

/* ─────────── 게임 마감 / 해제 ─────────── */

export async function lockGameAction(
  tournamentId: number,
  eventId: number,
  gameNumber: number,
  squadNumber: number = 1,
): Promise<ScoreActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("lock_game", {
    p_event_id: eventId,
    p_game_number: gameNumber,
    p_squad_number: squadNumber,
  });
  if (error) return { error: error.message };
  revalidatePath(scoresPath(tournamentId, eventId));
  return { message: `${gameNumber}게임을 마감했습니다.` };
}

export async function unlockGameAction(
  tournamentId: number,
  eventId: number,
  gameNumber: number,
  squadNumber: number = 1,
): Promise<ScoreActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_game", {
    p_event_id: eventId,
    p_game_number: gameNumber,
    p_squad_number: squadNumber,
  });
  if (error) return { error: error.message };
  revalidatePath(scoresPath(tournamentId, eventId));
  return { message: `${gameNumber}게임 마감을 해제했습니다.` };
}
