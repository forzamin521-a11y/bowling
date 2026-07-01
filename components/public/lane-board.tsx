import { Badge } from "@/components/ui/badge";
import { laneAtGame } from "@/lib/domain/lane-rotation";
import type { LaneMoveDirection } from "@/lib/supabase/database.types";

export type PublicLane = {
  lane: number;
  teams: { label: string; members: string[] }[];
  individuals: string[];
  isMakeup: boolean;
};

export function PublicLaneBoard({
  lanes,
  laneStart,
  laneEnd,
  direction,
  offset,
  gamesCount,
}: {
  lanes: PublicLane[];
  laneStart: number;
  laneEnd: number;
  direction: LaneMoveDirection;
  offset: number;
  gamesCount: number;
}) {
  if (lanes.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        아직 배정된 레인이 없습니다.
      </p>
    );
  }

  const games = Array.from({ length: gamesCount }, (_, i) => i + 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lanes.map((ln) => (
        <div key={ln.lane} className="rounded-md border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5 font-semibold">
              {ln.lane}번 레인
              {ln.isMakeup ? (
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400">
                  make-up
                </span>
              ) : null}
            </span>
            {offset > 0 ? (
              <span className="text-right text-xs break-words text-muted-foreground">
                {games
                  .map((g) =>
                    laneAtGame({
                      baseLane: ln.lane,
                      laneStart,
                      laneEnd,
                      direction,
                      offset,
                      gameNumber: g,
                    }),
                  )
                  .join(" → ")}
              </span>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            {ln.teams.map((t, i) => (
              <div key={i} className="text-sm">
                <Badge variant="secondary" className="mr-1 text-[10px]">
                  {t.label}
                </Badge>
                <span className="text-muted-foreground">
                  {t.members.join(", ")}
                </span>
              </div>
            ))}
            {ln.individuals.length > 0 ? (
              <div className="text-sm text-muted-foreground">
                {ln.individuals.join(", ")}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
