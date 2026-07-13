import {
  CATEGORY_AGE_ORDER,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

import { PlayerSearch, type CategoryOption } from "./player-search";

export const dynamic = "force-dynamic";

export default async function MasterPlayersPage() {
  const supabase = await createClient();
  const [{ data: regions }, { data: categories }] = await Promise.all([
    supabase.from("regions").select("id, name").order("sort_order"),
    supabase
      .from("tournament_categories")
      .select("age, gender")
      .eq("is_active", true),
  ]);

  // 전체 대회에 존재하는 (연령+성별) 종별의 고유 집합
  const seen = new Set<string>();
  const categoryOptions: CategoryOption[] = [];
  for (const c of categories ?? []) {
    const key = `${c.age}:${c.gender}`;
    if (seen.has(key)) continue;
    seen.add(key);
    categoryOptions.push({ age: c.age as CategoryAge, gender: c.gender as Gender });
  }
  categoryOptions.sort((a, b) => {
    const ai = CATEGORY_AGE_ORDER.indexOf(a.age);
    const bi = CATEGORY_AGE_ORDER.indexOf(b.age);
    if (ai !== bi) return ai - bi;
    return GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender);
  });

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">선수 마스터</h2>
        <p className="text-sm text-muted-foreground">
          시/군·소속·이름으로 선수를 검색하고, 과거 대회 이력과 수상 기록을
          확인합니다.
        </p>
      </div>

      <PlayerSearch regions={regions ?? []} categories={categoryOptions} />
    </div>
  );
}
