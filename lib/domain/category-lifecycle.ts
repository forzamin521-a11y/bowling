import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

export type CategoryMutationInput = {
  categoryId: number | null;
  tournamentId: number;
  age: CategoryAge;
  gender: Gender;
  active: boolean;
};

export type CategoryMutation =
  | {
      kind: "insert";
      values: {
        tournament_id: number;
        age: CategoryAge;
        gender: Gender;
        is_active: true;
      };
    }
  | { kind: "update"; categoryId: number; patch: { is_active: boolean } }
  | { kind: "noop" };

export function resolveCategoryMutation({
  categoryId,
  tournamentId,
  age,
  gender,
  active,
}: CategoryMutationInput): CategoryMutation {
  if (categoryId === null) {
    if (!active) return { kind: "noop" };
    return {
      kind: "insert",
      values: {
        tournament_id: tournamentId,
        age,
        gender,
        is_active: true,
      },
    };
  }

  return {
    kind: "update",
    categoryId,
    patch: { is_active: active },
  };
}
