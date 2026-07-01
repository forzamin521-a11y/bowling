"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { laneAtGame } from "@/lib/domain/lane-rotation";
import type { LaneMoveDirection } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import {
  lockGameAction,
  unlockGameAction,
  upsertScore,
} from "./actions";

export type LaneScores = {
  lane: number;
  players: {
    id: number;
    playerNumber: number;
    name: string;
    affiliationName: string;
    teamLabel: string;
    teamId: number | null;
  }[];
};

const key = (pid: number, game: number) => `${pid}:${game}`;

export function ScoreBoard({
  tournamentId,
  eventId,
  squadNumber,
  gamesCount,
  halftimeSplitAt,
  isSuperAdmin,
  lanes,
  secondHalfBaseByPlayer,
  secondHalfOrderByPlayer,
  laneStart,
  laneEnd,
  direction,
  offset,
  initialScores,
  lockedGames,
}: {
  tournamentId: number;
  eventId: number;
  squadNumber: number;
  gamesCount: number;
  halftimeSplitAt: number | null;
  isSuperAdmin: boolean;
  lanes: LaneScores[];
  secondHalfBaseByPlayer: Record<number, number>;
  secondHalfOrderByPlayer: Record<number, number>;
  laneStart: number | null;
  laneEnd: number | null;
  direction: LaneMoveDirection;
  offset: number;
  initialScores: Record<string, number>;
  lockedGames: number[];
}) {
  const games = useMemo(
    () => Array.from({ length: gamesCount }, (_, i) => i + 1),
    [gamesCount],
  );
  const lockedSet = useMemo(() => new Set(lockedGames), [lockedGames]);

  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [currentGame, setCurrentGame] = useState(1);
  const [view, setView] = useState<"lane" | "all">("lane");
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  function onSaved(pid: number, game: number, value: number | null) {
    setScores((prev) => {
      const next = { ...prev };
      if (value === null) delete next[key(pid, game)];
      else next[key(pid, game)] = value;
      return next;
    });
  }

  function lock(game: number) {
    startTransition(async () => {
      const r = await lockGameAction(tournamentId, eventId, game, squadNumber);
      if (r.error) toast.error(r.error);
      else toast.success(r.message ?? "마감되었습니다.");
    });
  }
  function unlock(game: number) {
    startTransition(async () => {
      const r = await unlockGameAction(tournamentId, eventId, game, squadNumber);
      if (r.error) toast.error(r.error);
      else toast.success(r.message ?? "해제되었습니다.");
    });
  }

  const currentLocked = lockedSet.has(currentGame);

  // "레인별" 뷰: 현재 게임 기준 레인 그룹 (이동규칙 적용한 표시 레인번호로 정렬)
  const currentLanes = useMemo(() => {
    const isSecond = halftimeSplitAt != null && currentGame > halftimeSplitAt;
    const byBase = new Map<number, LaneScores["players"]>();
    for (const ln of lanes) {
      for (const p of ln.players) {
        const base =
          isSecond && secondHalfBaseByPlayer[p.id] != null
            ? secondHalfBaseByPlayer[p.id]
            : ln.lane;
        const arr = byBase.get(base) ?? [];
        arr.push(p);
        byBase.set(base, arr);
      }
    }
    return [...byBase.entries()]
      .map(([base, players]) => ({
        displayLane:
          laneStart != null && laneEnd != null
            ? laneAtGame({
                baseLane: base,
                laneStart,
                laneEnd,
                direction,
                offset,
                gameNumber: currentGame,
              })
            : base,
        // 후반: 저장된 후반 치는 순서로 정렬. 전반: 레인배정 순서 유지.
        players: isSecond
          ? players
              .slice()
              .sort(
                (a, b) =>
                  (secondHalfOrderByPlayer[a.id] ?? Number.MAX_SAFE_INTEGER) -
                  (secondHalfOrderByPlayer[b.id] ?? Number.MAX_SAFE_INTEGER),
              )
          : players,
      }))
      .sort((a, b) => a.displayLane - b.displayLane);
  }, [
    lanes,
    currentGame,
    halftimeSplitAt,
    secondHalfBaseByPlayer,
    secondHalfOrderByPlayer,
    laneStart,
    laneEnd,
    direction,
    offset,
  ]);

  return (
    <div className="grid gap-5">
      {/* 보기 전환 + 게임 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5">
          <ToggleBtn active={view === "lane"} onClick={() => setView("lane")}>
            레인별
          </ToggleBtn>
          <ToggleBtn active={view === "all"} onClick={() => setView("all")}>
            전체
          </ToggleBtn>
        </div>

        <div className="flex flex-wrap gap-1">
          {games.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setCurrentGame(g)}
              aria-pressed={currentGame === g}
              aria-label={`${g}게임${lockedSet.has(g) ? " (마감됨)" : ""}`}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                currentGame === g
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {g}G
              {lockedSet.has(g) ? (
                <Lock className="h-3 w-3" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* 현재 게임 마감 컨트롤 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{currentGame}게임</span>
        {currentLocked ? (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            마감됨
          </Badge>
        ) : (
          <Badge variant="outline">입력중</Badge>
        )}
        <div className="ml-auto flex gap-2">
          {currentLocked ? (
            isSuperAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={pending}
                onClick={() => unlock(currentGame)}
              >
                <LockOpen className="h-4 w-4" />
                마감 해제
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: `${currentGame}게임을 마감할까요?`,
                  description:
                    "마감하면 이 게임 점수가 확정되고 순위표가 갱신됩니다.",
                  confirmLabel: "마감",
                  destructive: false,
                });
                if (ok) lock(currentGame);
              }}
            >
              <Lock className="h-4 w-4" />
              게임 마감
            </Button>
          )}
        </div>
      </div>

      {/* 점수 그리드 */}
      {view === "lane" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {currentLanes.map((ln) => (
            <Card key={ln.displayLane}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">
                  {ln.displayLane}번 레인
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {ln.players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">
                      {p.playerNumber}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      {p.name}
                      {p.affiliationName ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {p.affiliationName}
                          {p.teamLabel}
                        </span>
                      ) : null}
                    </span>
                    <ScoreCell
                      tournamentId={tournamentId}
                      eventId={eventId}
                      squadNumber={squadNumber}
                      playerId={p.id}
                      game={currentGame}
                      value={scores[key(p.id, currentGame)]}
                      locked={currentLocked}
                      onSaved={onSaved}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left font-medium">
                  선수
                </th>
                {games.map((g) => (
                  <th key={g} className="px-2 py-2 text-center font-medium">
                    <span className="inline-flex items-center gap-1">
                      {g}G
                      {lockedSet.has(g) ? <Lock className="h-3 w-3" /> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lanes.map((ln) => (
                <LaneRows
                  key={ln.lane}
                  lane={ln}
                  games={games}
                  scores={scores}
                  lockedSet={lockedSet}
                  tournamentId={tournamentId}
                  eventId={eventId}
                  squadNumber={squadNumber}
                  onSaved={onSaved}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function LaneRows({
  lane,
  games,
  scores,
  lockedSet,
  tournamentId,
  eventId,
  squadNumber,
  onSaved,
}: {
  lane: LaneScores;
  games: number[];
  scores: Record<string, number>;
  lockedSet: Set<number>;
  tournamentId: number;
  eventId: number;
  squadNumber: number;
  onSaved: (pid: number, game: number, value: number | null) => void;
}) {
  return (
    <>
      <tr className="border-b bg-muted/20">
        <td
          colSpan={games.length + 1}
          className="px-2 py-1 text-xs font-medium text-muted-foreground"
        >
          {lane.lane}번 레인
        </td>
      </tr>
      {lane.players.map((p) => (
        <tr key={p.id} className="border-b last:border-0">
          <td className="sticky left-0 z-10 bg-background px-2 py-1.5 whitespace-nowrap">
            <span className="font-mono text-xs text-muted-foreground">
              {p.playerNumber}
            </span>{" "}
            {p.name}
            {p.affiliationName ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {p.affiliationName}
                {p.teamLabel}
              </span>
            ) : null}
          </td>
          {games.map((g) => (
            <td key={g} className="px-1 py-1 text-center">
              <ScoreCell
                tournamentId={tournamentId}
                eventId={eventId}
                squadNumber={squadNumber}
                playerId={p.id}
                game={g}
                value={scores[key(p.id, g)]}
                locked={lockedSet.has(g)}
                onSaved={onSaved}
                compact
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ScoreCell({
  tournamentId,
  eventId,
  squadNumber,
  playerId,
  game,
  value,
  locked,
  onSaved,
  compact,
}: {
  tournamentId: number;
  eventId: number;
  squadNumber: number;
  playerId: number;
  game: number;
  value: number | undefined;
  locked: boolean;
  onSaved: (pid: number, game: number, value: number | null) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  async function save(raw: string) {
    const trimmed = raw.trim();
    let score: number | null;
    if (trimmed === "") {
      score = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > 300) {
        setStatus("error");
        return;
      }
      score = n;
    }
    setStatus("saving");
    const r = await upsertScore({
      tournamentId,
      eventId,
      squadNumber,
      tournamentPlayerId: playerId,
      gameNumber: game,
      score,
    });
    if (r.error) {
      setStatus("error");
      toast.error(r.error);
      return;
    }
    setStatus("saved");
    onSaved(playerId, game, score);
    timer.current = setTimeout(() => setStatus("idle"), 1200);
  }

  function schedule(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 1000);
  }

  return (
    <Input
      inputMode="numeric"
      disabled={locked}
      value={text}
      aria-label={`${game}게임 점수`}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
        setText(v);
        setStatus("idle");
        schedule(v);
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        save(text);
      }}
      className={cn(
        "h-9 text-center transition-colors",
        compact ? "w-14 px-1" : "w-16",
        status === "saving" &&
          "border-amber-500 ring-1 ring-amber-500/30",
        status === "saved" &&
          "border-emerald-500 ring-1 ring-emerald-500/30",
        status === "error" && "border-destructive ring-1 ring-destructive/30",
      )}
    />
  );
}
