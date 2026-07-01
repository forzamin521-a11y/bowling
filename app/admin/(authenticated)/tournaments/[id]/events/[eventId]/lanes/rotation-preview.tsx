"use client";

import { laneAtGame } from "@/lib/domain/lane-rotation";
import type { LaneMoveDirection } from "@/lib/supabase/database.types";

export function RotationPreview({
  laneStart,
  laneEnd,
  direction,
  offset,
  gamesCount,
  occupied,
}: {
  laneStart: number;
  laneEnd: number;
  direction: LaneMoveDirection;
  offset: number;
  gamesCount: number;
  occupied: { lane: number; label: string }[];
}) {
  if (occupied.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        배정된 레인이 없습니다.
      </p>
    );
  }

  if (offset === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        레인 이동이 없어 모든 게임에서 같은 레인을 사용합니다.
      </p>
    );
  }

  const games = Array.from({ length: gamesCount }, (_, i) => i + 1);
  const sorted = occupied.slice().sort((a, b) => a.lane - b.lane);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">배정</th>
            {games.map((g) => (
              <th key={g} className="px-2 py-1.5 text-center font-medium">
                {g}G
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.lane} className="border-b last:border-0">
              <td className="px-2 py-1.5">
                <span className="text-muted-foreground">{o.lane}번 · </span>
                {o.label}
              </td>
              {games.map((g) => (
                <td key={g} className="px-2 py-1.5 text-center font-mono">
                  {laneAtGame({
                    baseLane: o.lane,
                    laneStart,
                    laneEnd,
                    direction,
                    offset,
                    gameNumber: g,
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
