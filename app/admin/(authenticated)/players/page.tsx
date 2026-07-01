import { createClient } from "@/lib/supabase/server";

import { PlayerSearch } from "./player-search";

export const dynamic = "force-dynamic";

export default async function MasterPlayersPage() {
  const supabase = await createClient();
  const { data: regions } = await supabase
    .from("regions")
    .select("id, name")
    .order("sort_order");

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">선수 마스터</h2>
        <p className="text-sm text-muted-foreground">
          시/군·소속·이름으로 선수를 검색하고, 과거 대회 이력과 수상 기록을
          확인합니다.
        </p>
      </div>

      <PlayerSearch regions={regions ?? []} />
    </div>
  );
}
