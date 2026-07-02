"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { teamLabelForPosition } from "@/lib/domain/team-label";
import { createClient } from "@/lib/supabase/server";
import type { Database, Gender } from "@/lib/supabase/database.types";

type Client = Awaited<ReturnType<typeof createClient>>;

export type PlayerActionResult = { error?: string; message?: string };

/* ─────────── 헬퍼 ─────────── */

/** (시군 + 소속명)으로 소속을 찾거나 새로 만들어 affiliation_id 반환. */
async function ensureAffiliation(
  supabase: Client,
  regionId: number,
  name: string,
): Promise<number | null> {
  const trimmed = name.trim();

  const { data: existing } = await supabase
    .from("affiliations")
    .select("id")
    .eq("region_id", regionId)
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted } = await supabase
    .from("affiliations")
    .insert({ region_id: regionId, name: trimmed })
    .select("id")
    .maybeSingle();

  return inserted?.id ?? null;
}

/**
 * 마스터 선수 매칭: (이름 + 시군 + 소속명) 동일하면 기존 player 재사용,
 * 아니면 새 player 생성. created 플래그로 신규 여부 구분.
 */
async function resolvePlayer(
  supabase: Client,
  args: {
    name: string;
    regionId: number;
    affiliationId: number | null;
    affiliationName: string;
  },
): Promise<{ id: number; created: boolean }> {
  const { name, regionId, affiliationId, affiliationName } = args;

  const { data: matched } = await supabase
    .from("players")
    .select("id")
    .eq("name", name)
    .eq("region_id", regionId)
    .eq("affiliation_name", affiliationName)
    .limit(1)
    .maybeSingle();

  if (matched) return { id: matched.id, created: false };

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      name,
      region_id: regionId,
      affiliation_id: affiliationId,
      affiliation_name: affiliationName,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "선수 생성에 실패했습니다.");
  }
  return { id: created.id, created: true };
}

/* ─────────── 소속 자동완성 ─────────── */

export async function searchAffiliations(
  regionId: number,
  q: string,
): Promise<string[]> {
  const term = q.trim();
  if (!regionId || term.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("affiliations")
    .select("name")
    .eq("region_id", regionId)
    .ilike("name", `%${term}%`)
    .order("use_count", { ascending: false })
    .limit(8);

  return (data ?? []).map((r) => r.name);
}

/* ─────────── 동명이인 매칭 확인 ─────────── */

export type MatchCandidate = {
  playerId: number;
  name: string;
  birthYear: number | null;
  gender: Gender | null;
  participationCount: number;
};
export type NameMatch = { name: string; candidates: MatchCandidate[] };

/**
 * 등록하려는 이름들 중 (이름 + 시군 + 소속) 이 같은 기존 마스터 선수가 있는지 확인.
 * 후보가 있으면 동명이인일 수 있으므로 등록 화면에서 사용자가 선택하게 한다.
 */
export async function checkPlayerMatches(input: {
  regionId: number;
  affiliationName: string;
  names: string[];
}): Promise<NameMatch[]> {
  const regionId = Number(input.regionId);
  const affiliationName = input.affiliationName.trim();
  const names = [
    ...new Set(input.names.map((n) => n.trim()).filter(Boolean)),
  ];
  if (!regionId || !affiliationName || names.length === 0) return [];

  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, name, birth_year, gender")
    .eq("region_id", regionId)
    .eq("affiliation_name", affiliationName)
    .in("name", names);

  const list = players ?? [];
  const ids = list.map((p) => p.id);
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

  return names.map((name) => ({
    name,
    candidates: list
      .filter((p) => p.name === name)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        birthYear: p.birth_year,
        gender: p.gender,
        participationCount: countByPlayer.get(p.id) ?? 0,
      })),
  }));
}

/* ─────────── 선수 일괄 등록 ─────────── */

/** 항상 새 마스터 선수를 생성 (동명이인 허용). */
async function createMasterPlayer(
  supabase: Client,
  args: {
    name: string;
    regionId: number;
    affiliationId: number | null;
    affiliationName: string;
  },
): Promise<number> {
  const { data, error } = await supabase
    .from("players")
    .insert({
      name: args.name,
      region_id: args.regionId,
      affiliation_id: args.affiliationId,
      affiliation_name: args.affiliationName,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "선수 생성에 실패했습니다.");
  }
  return data.id;
}

const registerSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(),
  regionId: z.coerce.number().int().positive(),
  affiliationName: z.string().trim().min(1),
  entries: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        // 기존 선수 id 면 그 선수를 사용, null 이면 새 선수 생성
        playerId: z.union([z.coerce.number().int().positive(), z.null()]),
      }),
    )
    .min(1),
});

export async function registerPlayers(input: {
  tournamentId: number;
  categoryId: number;
  regionId: number;
  affiliationName: string;
  entries: { name: string; playerId: number | null }[];
}): Promise<PlayerActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인해주세요." };

  const { tournamentId, categoryId, regionId, affiliationName, entries } =
    parsed.data;
  const supabase = await createClient();

  const affiliationId = await ensureAffiliation(
    supabase,
    regionId,
    affiliationName,
  );

  // 선수번호/등록순서는 대회 전체에서 유일 → 대회 스코프로 베이스 계산.
  // 팀라벨 그룹(groupBase)만 종별 단위로 센다.
  const { data: existing } = await supabase
    .from("tournament_players")
    .select(
      "player_id, player_number, registered_order, tournament_category_id, region_id, affiliation_name",
    )
    .eq("tournament_id", tournamentId);

  const rows = existing ?? [];
  let nextNumber = Math.max(0, ...rows.map((r) => r.player_number)) + 1;
  let nextOrder = Math.max(0, ...rows.map((r) => r.registered_order)) + 1;
  const groupBase = rows.filter(
    (r) =>
      r.tournament_category_id === categoryId &&
      r.region_id === regionId &&
      r.affiliation_name === affiliationName,
  ).length;

  const registeredIds = new Set(rows.map((r) => r.player_id));

  let created = 0;
  let matched = 0;
  const skipped: string[] = [];
  const createdPlayerIds: number[] = []; // 실패 시 롤백용 (고아 방지)
  const inserts: Database["public"]["Tables"]["tournament_players"]["Insert"][] =
    [];
  let groupIndex = 0;

  for (const entry of entries) {
    let playerId = entry.playerId;
    if (playerId == null) {
      try {
        playerId = await createMasterPlayer(supabase, {
          name: entry.name,
          regionId,
          affiliationId,
          affiliationName,
        });
        createdPlayerIds.push(playerId);
        created += 1;
      } catch (e) {
        if (createdPlayerIds.length > 0) {
          await supabase.from("players").delete().in("id", createdPlayerIds);
        }
        return { error: e instanceof Error ? e.message : "선수 생성 실패" };
      }
    } else {
      matched += 1;
    }

    // 이미 이 대회에 등록됐거나 같은 배치에서 중복이면 건너뜀
    if (registeredIds.has(playerId)) {
      skipped.push(entry.name);
      if (entry.playerId == null) created -= 1;
      else matched -= 1;
      continue;
    }
    registeredIds.add(playerId);

    inserts.push({
      tournament_id: tournamentId,
      tournament_category_id: categoryId,
      player_id: playerId,
      region_id: regionId,
      affiliation_name: affiliationName,
      player_number: nextNumber,
      registered_order: nextOrder,
      // 트리거 after_tp_change 가 그룹 전체를 재계산하므로 미리보기 값으로 충분
      team_label: teamLabelForPosition(groupBase + groupIndex + 1),
    });
    nextNumber += 1;
    nextOrder += 1;
    groupIndex += 1;
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("tournament_players").insert(inserts);
    if (error) {
      // 등록 실패 시 이번에 새로 만든 마스터 선수는 되돌려 고아가 남지 않게
      if (createdPlayerIds.length > 0) {
        await supabase.from("players").delete().in("id", createdPlayerIds);
      }
      return { error: error.message };
    }
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/players/${categoryId}`);

  const parts: string[] = [];
  if (inserts.length > 0) {
    parts.push(`${inserts.length}명 등록`);
    if (matched > 0) parts.push(`기존 선수 ${matched}명`);
    if (created > 0) parts.push(`신규 ${created}명`);
  }
  if (skipped.length > 0) {
    parts.push(`이미 등록되어 제외: ${skipped.join(", ")}`);
  }
  if (parts.length === 0) return { error: "등록할 선수가 없습니다." };

  return { message: parts.join(" · ") };
}

/* ─────────── 선수 수정 ─────────── */

const updateSchema = z.object({
  tournamentId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(),
  tournamentPlayerId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  regionId: z.coerce.number().int().positive(),
  affiliationName: z.string().trim().min(1),
});

export async function updatePlayer(input: {
  tournamentId: number;
  categoryId: number;
  tournamentPlayerId: number;
  name: string;
  regionId: number;
  affiliationName: string;
}): Promise<PlayerActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인해주세요." };

  const {
    tournamentId,
    categoryId,
    tournamentPlayerId,
    name,
    regionId,
    affiliationName,
  } = parsed.data;
  const supabase = await createClient();

  const affiliationId = await ensureAffiliation(
    supabase,
    regionId,
    affiliationName,
  );

  let resolved;
  try {
    resolved = await resolvePlayer(supabase, {
      name,
      regionId,
      affiliationId,
      affiliationName,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "선수 처리 실패" };
  }

  // 트리거가 (시군+소속) 변경 시 양쪽 그룹 라벨을 재계산한다.
  const { error } = await supabase
    .from("tournament_players")
    .update({
      player_id: resolved.id,
      region_id: regionId,
      affiliation_name: affiliationName,
    })
    .eq("id", tournamentPlayerId)
    .eq("tournament_id", tournamentId);

  if (error) {
    if (error.message.includes("duplicate")) {
      return { error: "해당 선수는 이미 이 대회에 등록되어 있습니다." };
    }
    return { error: error.message };
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/players/${categoryId}`);
  return { message: "수정되었습니다." };
}

/* ─────────── 선수 삭제 ─────────── */

export async function deletePlayer(
  tournamentId: number,
  categoryId: number,
  tournamentPlayerId: number,
): Promise<PlayerActionResult> {
  const supabase = await createClient();
  // 선수번호는 재사용하지 않음(빈 번호 그대로). 트리거가 그룹 라벨 재계산.
  const { error } = await supabase
    .from("tournament_players")
    .delete()
    .eq("id", tournamentPlayerId)
    .eq("tournament_id", tournamentId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/tournaments/${tournamentId}/players/${categoryId}`);
  return {};
}
