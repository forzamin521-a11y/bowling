import type { createClient } from "./server";

type Client = Awaited<ReturnType<typeof createClient>>;

const INACTIVE_CATEGORY_ERROR =
  "사용 중지된 종별입니다. 대회 상세에서 다시 활성화해주세요.";

export type CategoryGuardRow = {
  id: number;
  tournament_id: number;
  is_active: boolean;
};

type CategoryValidation = { ok: true } | { error: string };

export function validateActiveCategory(
  category: CategoryGuardRow | null,
  tournamentId: number,
): CategoryValidation {
  if (!category || category.tournament_id !== tournamentId) {
    return { error: "대회 종별 정보가 일치하지 않습니다." } as const;
  }
  if (!category.is_active) return { error: INACTIVE_CATEGORY_ERROR } as const;
  return { ok: true } as const;
}

export async function requireActiveCategory(
  supabase: Client,
  tournamentId: number,
  categoryId: number,
) {
  const { data: category, error } = await supabase
    .from("tournament_categories")
    .select("id, tournament_id, is_active")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) return { error: error.message } as const;
  const validation = validateActiveCategory(category, tournamentId);
  if (!("ok" in validation)) return validation;

  return { category } as const;
}

export async function requireActiveEvent(
  supabase: Client,
  tournamentId: number,
  eventId: number,
) {
  const { data: event, error } = await supabase
    .from("tournament_events")
    .select("id, tournament_category_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) return { error: error.message } as const;
  if (!event) return { error: "세부종목을 찾을 수 없습니다." } as const;

  const category = await requireActiveCategory(
    supabase,
    tournamentId,
    event.tournament_category_id,
  );
  if ("error" in category) return category;

  return { event, category: category.category } as const;
}
