import Link from "next/link";

import { categoryFullLabel } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

export type CategoryTab = {
  id: number;
  age: CategoryAge;
  gender: Gender;
  count: number;
};

/** 선수 등록 페이지의 종별 전환 탭 (링크형). 활성 종별은 activeId 로 결정. */
export function CategoryTabs({
  tournamentId,
  categories,
  activeId,
}: {
  tournamentId: number;
  categories: CategoryTab[];
  activeId: number;
}) {
  if (categories.length === 0) return null;

  return (
    <div className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground">
      {categories.map((c) => {
        const active = c.id === activeId;
        return (
          <Link
            key={c.id}
            href={`/admin/tournaments/${tournamentId}/players/${c.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            {categoryFullLabel(c.age, c.gender)}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active
                  ? "bg-muted text-muted-foreground"
                  : "text-muted-foreground/70",
              )}
            >
              {c.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
