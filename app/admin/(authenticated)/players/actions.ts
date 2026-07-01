"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Gender } from "@/lib/supabase/database.types";

export type MasterPlayerResult = {
  id: number;
  name: string;
  regionId: number;
  affiliationName: string;
  birthYear: number | null;
  gender: Gender | null;
  participationCount: number;
};

const searchSchema = z.object({
  regionId: z.coerce.number().int().positive().optional(),
  affiliation: z.string().optional(),
  name: z.string().optional(),
});

export async function searchMasterPlayers(filters: {
  regionId?: number;
  affiliation?: string;
  name?: string;
}): Promise<MasterPlayerResult[]> {
  const parsed = searchSchema.safeParse(filters);
  if (!parsed.success) return [];
  const { regionId, affiliation, name } = parsed.data;

  const supabase = await createClient();

  let query = supabase
    .from("players")
    .select("id, name, region_id, affiliation_name, birth_year, gender")
    .order("name")
    .limit(50);

  if (regionId) query = query.eq("region_id", regionId);
  const nm = name?.trim();
  const aff = affiliation?.trim();
  if (nm) query = query.ilike("name", `%${nm}%`);
  if (aff) query = query.ilike("affiliation_name", `%${aff}%`);

  const { data: players, error } = await query;
  if (error || !players) return [];

  const ids = players.map((p) => p.id);
  const { data: tps } = ids.length
    ? await supabase
        .from("tournament_players")
        .select("player_id")
        .in("player_id", ids)
    : { data: [] as { player_id: number }[] };

  const countByPlayer = new Map<number, number>();
  for (const tp of tps ?? []) {
    countByPlayer.set(tp.player_id, (countByPlayer.get(tp.player_id) ?? 0) + 1);
  }

  return players.map((p) => ({
    id: p.id,
    name: p.name,
    regionId: p.region_id,
    affiliationName: p.affiliation_name,
    birthYear: p.birth_year,
    gender: p.gender,
    participationCount: countByPlayer.get(p.id) ?? 0,
  }));
}
