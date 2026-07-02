"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

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
  // 참가 이력 기반 종별 필터 (연령+성별). 둘 다 있어야 적용.
  age: z.string().optional(),
  gender: z.string().optional(),
});

export async function searchMasterPlayers(filters: {
  regionId?: number;
  affiliation?: string;
  name?: string;
  age?: CategoryAge;
  gender?: Gender;
}): Promise<MasterPlayerResult[]> {
  const parsed = searchSchema.safeParse(filters);
  if (!parsed.success) return [];
  const { regionId, affiliation, name, age, gender } = parsed.data;

  const supabase = await createClient();

  // 종별 필터: 해당 (연령+성별) 종별에 참가한 적 있는 선수 id 집합을 먼저 구한다.
  let categoryPlayerIds: number[] | null = null;
  if (age && gender) {
    const { data: cats } = await supabase
      .from("tournament_categories")
      .select("id")
      .eq("age", age)
      .eq("gender", gender);
    const catIds = (cats ?? []).map((c) => c.id);
    if (catIds.length === 0) return [];

    const { data: tpRows } = await supabase
      .from("tournament_players")
      .select("player_id")
      .in("tournament_category_id", catIds);
    categoryPlayerIds = [...new Set((tpRows ?? []).map((r) => r.player_id))];
    if (categoryPlayerIds.length === 0) return [];
  }

  let query = supabase
    .from("players")
    .select("id, name, region_id, affiliation_name, birth_year, gender")
    .order("name")
    .limit(50);

  if (categoryPlayerIds) query = query.in("id", categoryPlayerIds);
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
