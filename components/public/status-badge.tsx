import { TOURNAMENT_STATUS_LABEL } from "@/lib/domain/labels";
import type { TournamentStatus } from "@/lib/supabase/database.types";

/** 대회 진행 상태 배지 (공개 페이지 공용). */
export function StatusBadge({ status }: { status: TournamentStatus }) {
  const label = TOURNAMENT_STATUS_LABEL[status];
  if (status === "ongoing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {label}
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
      {label}
    </span>
  );
}
