"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  defaultRanges,
  squadSplitByRanges,
  type SquadRange,
} from "@/lib/domain/squad-split";
import { cn } from "@/lib/utils";

import { saveSquadAssignment } from "./actions";

export type SquadPlayer = {
  id: number;
  number: number;
  name: string;
  teamId: number | null;
  teamLabel: string | null;
};

const MAX_SQUADS = 8;

export function SquadBoard({
  tournamentId,
  eventId,
  initialSquadCount,
  initialRanges,
  players,
  hasLockedGame,
}: {
  tournamentId: number;
  eventId: number;
  initialSquadCount: number;
  initialRanges: SquadRange[] | null;
  players: SquadPlayer[];
  hasLockedGame: boolean;
}) {
  const total = players.length;
  const numbers = useMemo(() => players.map((p) => p.number), [players]);

  const [squadCount, setSquadCount] = useState(Math.max(1, initialSquadCount));
  const [ranges, setRanges] = useState<SquadRange[]>(() =>
    initialRanges && initialRanges.length === Math.max(1, initialSquadCount)
      ? initialRanges
      : defaultRanges(numbers, Math.max(1, initialSquadCount)),
  );
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const labelByTeam = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of players) {
      if (p.teamId != null && p.teamLabel) m.set(p.teamId, p.teamLabel);
    }
    return m;
  }, [players]);

  const { squadOfPlayer, unassignedIds, splitTeamIds } = useMemo(
    () =>
      squadSplitByRanges({
        players: players.map((p) => ({
          id: p.id,
          number: p.number,
          teamId: p.teamId,
        })),
        ranges,
      }),
    [players, ranges],
  );
  const splitSet = useMemo(() => new Set(splitTeamIds), [splitTeamIds]);

  const squads = useMemo(
    () => Array.from({ length: squadCount }, (_, i) => i + 1),
    [squadCount],
  );

  const playersBySquad = useMemo(() => {
    const m = new Map<number, SquadPlayer[]>();
    for (const sq of squads) m.set(sq, []);
    for (const p of [...players].sort((a, b) => a.number - b.number)) {
      const sq = squadOfPlayer[p.id];
      if (sq != null) m.get(sq)?.push(p);
    }
    return m;
  }, [squads, players, squadOfPlayer]);

  const unassigned = useMemo(() => {
    const set = new Set(unassignedIds);
    return [...players]
      .filter((p) => set.has(p.id))
      .sort((a, b) => a.number - b.number);
  }, [unassignedIds, players]);

  const splitLabels = splitTeamIds
    .map((tid) => labelByTeam.get(tid) ?? `팀 ${tid}`)
    .filter(Boolean);

  function changeCount(next: number) {
    const n = Math.min(MAX_SQUADS, Math.max(1, next));
    setSquadCount(n);
    setRanges(defaultRanges(numbers, n)); // 조 수 바꾸면 기본 범위로 재설정
  }

  function updateRange(idx: number, key: "from" | "to", value: number) {
    setRanges((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    );
  }

  async function doSave() {
    if (unassignedIds.length > 0) {
      toast.error(
        `어느 조에도 속하지 않은 선수가 ${unassignedIds.length}명 있습니다. 번호 구간을 확인하세요.`,
      );
      return;
    }
    if (splitTeamIds.length > 0) {
      const ok = await confirm({
        title: "같은 팀이 서로 다른 조로 나뉩니다",
        description: `${splitLabels.join(", ")} 팀이 분리됩니다. 그래도 저장할까요?`,
        confirmLabel: "저장",
        destructive: false,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await saveSquadAssignment({
        tournamentId,
        eventId,
        squadCount,
        players: players.map((p) => ({
          playerId: p.id,
          squad: squadOfPlayer[p.id] ?? 1,
        })),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "저장되었습니다.");
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm">
        <span>
          총 <b>{total}</b>명
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">조 수</span>
          <div className="inline-flex items-center rounded-md border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={squadCount <= 1 || pending}
              onClick={() => changeCount(squadCount - 1)}
              aria-label="조 수 줄이기"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-medium">{squadCount}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={squadCount >= MAX_SQUADS || pending}
              onClick={() => changeCount(squadCount + 1)}
              aria-label="조 수 늘리기"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        각 조의 선수 번호 구간을 직접 지정하세요. 같은 팀이 다른 조로 갈리면 저장
        시 확인을 요청합니다.
      </p>

      {hasLockedGame && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          이미 마감된 게임이 있어 조 재편성을 저장할 수 없습니다. 마감을 먼저
          해제하세요.
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            어느 조에도 속하지 않은 선수 {unassigned.length}명:{" "}
            {unassigned
              .slice(0, 12)
              .map((p) => p.number)
              .join(", ")}
            {unassigned.length > 12 ? " …" : ""}
          </span>
        </div>
      )}

      {splitLabels.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            같은 팀이 서로 다른 조로 나뉩니다: <b>{splitLabels.join(", ")}</b>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="default"
          onClick={doSave}
          disabled={pending || hasLockedGame}
          className="ml-auto gap-1"
        >
          <Save className="h-4 w-4" />
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {squads.map((sq) => {
          const list = playersBySquad.get(sq) ?? [];
          const r = ranges[sq - 1] ?? { from: 0, to: 0 };
          return (
            <div key={sq} className="flex flex-col gap-2 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{sq}조</span>
                <Badge variant="secondary">{list.length}명</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={r.from || ""}
                  onChange={(e) =>
                    updateRange(sq - 1, "from", Number(e.target.value) || 0)
                  }
                  className="h-8 w-20 text-center"
                  aria-label={`${sq}조 시작 번호`}
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={r.to || ""}
                  onChange={(e) =>
                    updateRange(sq - 1, "to", Number(e.target.value) || 0)
                  }
                  className="h-8 w-20 text-center"
                  aria-label={`${sq}조 끝 번호`}
                />
                <span className="text-xs text-muted-foreground">번</span>
              </div>
              <ul className="grid max-h-56 gap-0.5 overflow-y-auto">
                {list.map((p) => {
                  const split = p.teamId != null && splitSet.has(p.teamId);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded px-1.5 py-0.5 text-sm"
                    >
                      <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                        {p.number}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.teamLabel ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px]",
                            split && "border-destructive text-destructive",
                          )}
                        >
                          {p.teamLabel}
                        </Badge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
