"use client";

import { useMemo, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, RotateCcw, Save, Users, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  classifyLane,
  groupKey,
  teamDisplayName,
  type PlayerGroupInfo,
} from "@/lib/domain/team-from-lane";
import type { EventType, LaneMoveDirection } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { resetLaneAssignment, saveLaneAssignment } from "./actions";

export type BoardPlayer = {
  id: number;
  playerNumber: number;
  name: string;
  regionId: number;
  regionName: string;
  affiliationName: string;
  teamLabel: string;
};

const POOL = "pool";
const laneKey = (lane: number) => `L${lane}`;
const isContainerId = (id: UniqueIdentifier) =>
  typeof id === "string" && (id === POOL || id.startsWith("L"));

const info = (p: BoardPlayer): PlayerGroupInfo => ({
  regionId: p.regionId,
  affiliationName: p.affiliationName,
  teamLabel: p.teamLabel,
});

export function LaneBoard({
  tournamentId,
  eventId,
  squadNumber,
  eventType,
  laneStart,
  laneEnd,
  halftimeSplitAt,
  gamesCount,
  maxPerLane,
  players,
  initialLaneLists,
  initialSecondHalfLaneOf,
  initialSecondOrder,
}: {
  tournamentId: number;
  eventId: number;
  squadNumber: number;
  eventType: EventType;
  laneStart: number;
  laneEnd: number;
  direction: LaneMoveDirection;
  offset: number;
  gamesCount: number;
  halftimeSplitAt: number | null;
  maxPerLane: number;
  players: BoardPlayer[];
  initialLaneLists: Record<number, number[]>;
  initialSecondHalfLaneOf: Record<number, number>;
  initialSecondOrder: Record<number, number[]>;
}) {
  const isTeam = eventType !== "single";
  const hasSecondHalf =
    eventType === "team5" &&
    halftimeSplitAt != null &&
    halftimeSplitAt < gamesCount;

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );
  const playerByNumber = useMemo(
    () => new Map(players.map((p) => [p.playerNumber, p])),
    [players],
  );

  const lanes = useMemo(
    () =>
      Array.from({ length: laneEnd - laneStart + 1 }, (_, i) => laneStart + i),
    [laneStart, laneEnd],
  );

  // 컨테이너: pool + L{lane}, 값은 "치는 순서" 그대로의 playerId 배열
  const [containers, setContainers] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = { [POOL]: [] };
    for (const lane of lanes) init[laneKey(lane)] = [...(initialLaneLists[lane] ?? [])];
    const placed = new Set(Object.values(initialLaneLists).flat());
    init[POOL] = players.filter((p) => !placed.has(p.id)).map((p) => p.id);
    return init;
  });
  const [secondOverrides, setSecondOverrides] = useState<Record<number, number>>(
    initialSecondHalfLaneOf,
  );
  // 후반 레인별 치는 순서 (선수id 배열). 멤버십이 바뀌면 렌더 시 reconcile.
  const [secondOrder, setSecondOrder] = useState<Record<number, number[]>>(
    initialSecondOrder,
  );
  const [half, setHalf] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [subTeam, setSubTeam] = useState<TeamView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 터치: 길게 눌러야 드래그 시작 → 페이지 스크롤과 충돌 방지
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 파생: 선수의 (전반) 레인/순서
  const baseLaneOf = useMemo(() => {
    const m = new Map<number, number>();
    for (const lane of lanes) {
      for (const pid of containers[laneKey(lane)] ?? []) m.set(pid, lane);
    }
    return m;
  }, [containers, lanes]);

  const findContainer = (id: UniqueIdentifier): string | undefined => {
    if (isContainerId(id)) return id as string;
    const pid = Number(id);
    return Object.keys(containers).find((k) => containers[k].includes(pid));
  };

  /* ── 드래그 (전반에서만) ── */
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to) return;
    setContainers((prev) => {
      const activeId = Number(active.id);
      const fromArr = [...prev[from]];
      const toArr = [...prev[to]];
      const idx = fromArr.indexOf(activeId);
      if (idx < 0) return prev;
      fromArr.splice(idx, 1);
      let insertAt = toArr.length;
      if (!isContainerId(over.id)) {
        const oi = toArr.indexOf(Number(over.id));
        if (oi >= 0) insertAt = oi;
      }
      toArr.splice(insertAt, 0, activeId);
      return { ...prev, [from]: fromArr, [to]: toArr };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (from && to && from === to && !isContainerId(over.id)) {
      setContainers((prev) => {
        const arr = [...prev[from]];
        const oldI = arr.indexOf(Number(active.id));
        const newI = arr.indexOf(Number(over.id));
        if (oldI < 0 || newI < 0 || oldI === newI) return prev;
        return { ...prev, [from]: arrayMove(arr, oldI, newI) };
      });
    }
  }

  /* ── 번호 입력으로 레인에 추가 (입력 순서대로 뒤에 붙음) ── */
  async function addNumbers(lane: number, text: string) {
    const nums = text
      .split(/[\s,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length === 0) return;

    const toAdd: number[] = [];
    for (const n of nums) {
      const p = playerByNumber.get(n);
      if (!p) {
        toast.error(`${n}번 선수가 이 조에 없습니다.`);
        continue;
      }
      if (baseLaneOf.get(p.id) === lane) continue;
      if (!toAdd.includes(p.id)) toAdd.push(p.id);
    }
    if (toAdd.length === 0) return;

    const lk = laneKey(lane);
    const resultIds = [
      ...(containers[lk] ?? []).filter((id) => !toAdd.includes(id)),
      ...toAdd,
    ];
    if (resultIds.length > maxPerLane) {
      toast.error(`${lane}번 레인은 최대 ${maxPerLane}명입니다.`);
      return;
    }
    if (isTeam) {
      const keys = new Set(
        resultIds.map((id) => groupKey(info(playerById.get(id)!))),
      );
      if (keys.size > 1) {
        const ok = await confirm({
          title: `${lane}번 레인에 다른 소속/팀이 섞입니다`,
          description:
            '이 레인은 팀이 아닌 "make-up" 레인이 되어 개인 점수만 기록됩니다. 계속할까요?',
          confirmLabel: "계속",
          destructive: false,
        });
        if (!ok) return;
      }
    }

    setContainers((prev) => {
      const next: Record<string, number[]> = {};
      for (const k of Object.keys(prev))
        next[k] = prev[k].filter((id) => !toAdd.includes(id));
      next[lk] = [...next[lk], ...toAdd];
      return next;
    });
  }

  function removeFromLane(pid: number) {
    setContainers((prev) => {
      const next: Record<string, number[]> = {};
      for (const k of Object.keys(prev))
        next[k] = prev[k].filter((id) => id !== pid);
      next[POOL] = [...next[POOL], pid];
      return next;
    });
    setSecondOverrides((prev) => {
      if (prev[pid] == null) return prev;
      const n = { ...prev };
      delete n[pid];
      return n;
    });
  }

  /* ── 저장 / 초기화 ── */
  function doSave() {
    const laneInput = lanes
      .map((lane) => ({ baseLane: lane, playerIds: containers[laneKey(lane)] ?? [] }))
      .filter((l) => l.playerIds.length > 0);
    // 후반 배치: 후반 레인별로 치는 순서(orderedSecondIds)대로 평면화
    const secondHalf = hasSecondHalf
      ? lanes.flatMap((lane) =>
          orderedSecondIds(lane).map((pid) => ({ playerId: pid, lane })),
        )
      : undefined;
    startTransition(async () => {
      const r = await saveLaneAssignment({
        tournamentId,
        eventId,
        squadNumber,
        lanes: laneInput,
        secondHalf,
      });
      if (r.error) toast.error(r.error);
      else toast.success(r.message ?? "저장되었습니다.");
    });
  }

  async function doReset() {
    const r = await resetLaneAssignment(tournamentId, eventId, squadNumber);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setContainers(() => {
      const init: Record<string, number[]> = { [POOL]: players.map((p) => p.id) };
      for (const lane of lanes) init[laneKey(lane)] = [];
      return init;
    });
    setSecondOverrides({});
    setSecondOrder({});
    toast.success(r.message ?? "초기화했습니다.");
  }

  /* ── team5 후반 교체 ── */
  type TeamView = {
    baseLane: number;
    label: string;
    starters1: number[];
    benchId: number | null;
  };
  const team5Teams: TeamView[] = useMemo(() => {
    if (eventType !== "team5") return [];
    const out: TeamView[] = [];
    for (const lane of lanes) {
      const ids = containers[laneKey(lane)] ?? [];
      const ps = ids.map((id) => playerById.get(id)!).filter(Boolean);
      const cls = classifyLane(ps.map(info), eventType);
      if (cls.kind !== "team" || !cls.group) continue;
      const gk = groupKey(cls.group);
      const bench =
        players.find(
          (p) => baseLaneOf.get(p.id) !== lane && groupKey(info(p)) === gk,
        ) ?? null;
      out.push({
        baseLane: lane,
        label: teamDisplayName(cls.group.affiliationName, cls.group.teamLabel),
        starters1: ids,
        benchId: bench?.id ?? null,
      });
    }
    return out;
  }, [eventType, lanes, containers, players, playerById, baseLaneOf]);

  function applySubstitution(team: TeamView, chosen5: number[]) {
    const incoming = chosen5.filter((id) => !team.starters1.includes(id));
    setSecondOverrides((prev) => {
      const next = { ...prev };
      const roster = [...team.starters1, ...(team.benchId ? [team.benchId] : [])];
      for (const id of roster) delete next[id];
      if (incoming.length === 1 && team.benchId != null) {
        const inId = incoming[0];
        const outId = team.starters1.find((id) => !chosen5.includes(id));
        const benchLane = baseLaneOf.get(inId);
        if (benchLane != null && outId != null) {
          next[inId] = team.baseLane;
          next[outId] = benchLane;
        }
      }
      return next;
    });
    setSubTeam(null);
    toast.success("후반 출전 선수를 변경했습니다. 저장을 눌러 적용하세요.");
  }

  // 후반 레인 (override 우선, 없으면 전반 레인)
  const secondLaneOfPlayer = (pid: number) =>
    secondOverrides[pid] ?? baseLaneOf.get(pid);

  // 후반에 이 레인에 있는 멤버 (기본 정렬: 전반 레인 → 선수번호)
  const membersSecond = (lane: number) =>
    players
      .filter((p) => baseLaneOf.has(p.id))
      .filter((p) => secondLaneOfPlayer(p.id) === lane)
      .sort(
        (a, b) =>
          (baseLaneOf.get(a.id)! - baseLaneOf.get(b.id)!) ||
          a.playerNumber - b.playerNumber,
      )
      .map((p) => p.id);

  // 저장된/사용자가 정한 후반 타순을 현재 멤버십과 reconcile한 순서
  const orderedSecondIds = (lane: number): number[] => {
    const members = membersSecond(lane);
    const memberSet = new Set(members);
    const ord = secondOrder[lane] ?? [];
    const head = ord.filter((id) => memberSet.has(id));
    const headSet = new Set(head);
    const tail = members.filter((id) => !headSet.has(id));
    return [...head, ...tail];
  };

  function onSecondDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const a = Number(active.id);
    const o = Number(over.id);
    if (a === o) return;
    const la = secondLaneOfPlayer(a);
    const lo = secondLaneOfPlayer(o);
    if (la == null || la !== lo) return; // 같은 레인 안에서만 순서 변경
    setSecondOrder((prev) => {
      const cur = orderedSecondIds(la);
      const oldI = cur.indexOf(a);
      const newI = cur.indexOf(o);
      if (oldI < 0 || newI < 0 || oldI === newI) return prev;
      return { ...prev, [la]: arrayMove(cur, oldI, newI) };
    });
  }

  // 단일 DndContext에 항상 같은 핸들러를 넘기고 내부에서 half로 분기한다.
  // (half 따라 핸들러를 다르게 넘기면 dnd-kit 내부 deps 배열 크기가 바뀌어 오류)
  function handleDragOver(e: DragOverEvent) {
    if (half === 1) onDragOver(e);
  }
  function handleDragEnd(e: DragEndEvent) {
    if (half === 1) onDragEnd(e);
    else onSecondDragEnd(e);
  }

  const pool = containers[POOL] ?? [];

  const board = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lanes.map((lane) => {
        const ids = half === 1 ? containers[laneKey(lane)] ?? [] : orderedSecondIds(lane);
        const ps = ids.map((id) => playerById.get(id)!).filter(Boolean);
        const cls = classifyLane(ps.map(info), eventType);
        const team5 = team5Teams.find((t) => t.baseLane === lane);
        return (
          <LaneContainer key={lane} lane={lane} droppable={half === 1}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                {lane}번 레인
                <span className="text-xs font-normal text-muted-foreground">
                  {ps.length}/{maxPerLane}
                </span>
              </span>
              <LaneBadge kind={cls.kind} group={cls.group} />
            </div>

            {half === 1 ? (
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="mb-2 grid gap-1">
                  {ps.map((p, i) => (
                    <SortableChip
                      key={p.id}
                      player={p}
                      order={i + 1}
                      onRemove={() => removeFromLane(p.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            ) : (
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="mb-2 grid gap-1">
                  {ps.map((p, i) => (
                    <SortableChip key={p.id} player={p} order={i + 1} />
                  ))}
                </div>
              </SortableContext>
            )}

            {half === 2 && team5 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setSubTeam(team5)}
              >
                교체
              </Button>
            ) : null}
            {half === 1 ? (
              <LaneInput onAdd={(text) => addNumbers(lane, text)} />
            ) : null}
          </LaneContainer>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {hasSecondHalf ? (
          <div className="inline-flex rounded-md border p-0.5">
            <HalfBtn active={half === 1} onClick={() => setHalf(1)}>
              전반 (1~{halftimeSplitAt}G)
            </HalfBtn>
            <HalfBtn active={half === 2} onClick={() => setHalf(2)}>
              후반 ({(halftimeSplitAt ?? 0) + 1}~{gamesCount}G)
            </HalfBtn>
          </div>
        ) : null}
        <ConfirmDialog
          title="레인 배정을 초기화할까요?"
          description="이 조의 레인 배정·팀 구성이 모두 초기화됩니다. 저장 전 상태로 되돌릴 수 없습니다."
          confirmLabel="초기화"
          destructive={false}
          onConfirm={doReset}
          trigger={
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="gap-1"
            >
              <RotateCcw className="h-4 w-4" />
              초기화
            </Button>
          }
        />
        <Button
          type="button"
          onClick={doSave}
          loading={pending}
          className="ml-auto gap-1"
        >
          {pending ? null : <Save className="h-4 w-4" />}
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        레인에 선수번호를 입력한 <b>순서</b>가 치는 순서가 됩니다. 잘못 넣었으면
        칩을 <b>드래그</b>해 같은 레인 안에서 순서를 바꾸거나 다른 레인으로 옮기세요.
        {isTeam
          ? " 같은 소속·팀이 정원만큼 모이면 팀, 섞이면 make-up(개인기록) 레인이 됩니다."
          : ""}
      </p>

      {half === 2 ? (
        <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          후반 모드: 각 5인조 팀의 “교체”로 후반 출전 5명을 바꾸고, 칩을 드래그해 후반 치는 순서를 바꿉니다. (레인 이동은 교체로만)
        </p>
      ) : null}

      <DndContext
        id="lane-board-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* 미배정 풀 (전반에서만) */}
        {half === 1 ? (
          <PoolContainer>
            {pool.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                모든 선수가 배정되었습니다.
              </p>
            ) : (
              <SortableContext items={pool} strategy={verticalListSortingStrategy}>
                <div className="flex flex-wrap gap-1.5">
                  {pool.map((id) => {
                    const p = playerById.get(id);
                    if (!p) return null;
                    return <PoolChip key={id} player={p} />;
                  })}
                </div>
              </SortableContext>
            )}
          </PoolContainer>
        ) : null}
        {board}
      </DndContext>

      {subTeam ? (
        <SubstitutionDialog
          team={subTeam}
          currentSecond={players
            .filter(
              (p) => (secondOverrides[p.id] ?? baseLaneOf.get(p.id)) === subTeam.baseLane,
            )
            .map((p) => p.id)}
          playerById={playerById}
          onClose={() => setSubTeam(null)}
          onApply={(chosen) => applySubstitution(subTeam, chosen)}
        />
      ) : null}
    </div>
  );
}

function PoolContainer({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border p-3 transition-colors",
        isOver ? "border-primary bg-accent/40" : "bg-muted/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" />
        미배정
      </div>
      {children}
    </div>
  );
}

function LaneContainer({
  lane,
  droppable,
  children,
}: {
  lane: number;
  droppable: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey(lane), disabled: !droppable });
  return (
    <div
      ref={droppable ? setNodeRef : undefined}
      className={cn(
        "rounded-xl bg-card p-3 ring-1 ring-foreground/10",
        droppable && isOver && "ring-2 ring-primary",
      )}
    >
      {children}
    </div>
  );
}

function SortableChip({
  player,
  order,
  onRemove,
}: {
  player: BoardPlayer;
  order: number;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded border bg-card px-2 py-1 text-sm",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        className="-m-1 flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="순서 이동"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-4 text-center font-mono text-[10px] text-muted-foreground">
        {order}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {player.playerNumber}
      </span>
      <span className="flex-1 truncate font-medium">{player.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {player.affiliationName}
        {player.teamLabel}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${player.name} 빼기`}
          className="-m-1 flex h-8 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function PoolChip({ player }: { player: BoardPlayer }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.id });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "inline-flex cursor-grab touch-none items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs active:cursor-grabbing",
        isDragging && "opacity-60",
      )}
    >
      <span className="font-mono text-muted-foreground">{player.playerNumber}</span>
      <span className="font-medium">{player.name}</span>
      <span className="text-muted-foreground">
        {player.affiliationName}
        {player.teamLabel}
      </span>
    </span>
  );
}

function LaneBadge({
  kind,
  group,
}: {
  kind: ReturnType<typeof classifyLane>["kind"];
  group: PlayerGroupInfo | null;
}) {
  if (kind === "team" && group) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
        {teamDisplayName(group.affiliationName, group.teamLabel)}
      </span>
    );
  }
  if (kind === "makeup") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        make-up
      </span>
    );
  }
  return null;
}

function LaneInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  function submit() {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  }
  return (
    <div className="flex gap-1.5">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        inputMode="numeric"
        placeholder="선수번호 입력 (예: 45, 48, 46)"
        className="h-8 text-sm"
        aria-label="선수번호 입력"
      />
      <Button type="button" size="sm" variant="outline" onClick={submit}>
        추가
      </Button>
    </div>
  );
}

function HalfBtn({
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

function SubstitutionDialog({
  team,
  currentSecond,
  playerById,
  onClose,
  onApply,
}: {
  team: { baseLane: number; label: string; starters1: number[]; benchId: number | null };
  currentSecond: number[];
  playerById: Map<number, BoardPlayer>;
  onClose: () => void;
  onApply: (chosen5: number[]) => void;
}) {
  const roster = [...team.starters1, ...(team.benchId ? [team.benchId] : [])];
  const initial = currentSecond.length === 5 ? currentSecond : team.starters1;
  const [chosen, setChosen] = useState<number[]>(initial);

  function toggle(id: number) {
    setChosen((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) {
        toast.error("출전은 5명까지 선택할 수 있습니다.");
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>후반전 선수 교체</DialogTitle>
          <DialogDescription>
            {team.label} · 후반전 출전 5명을 선택하세요. 빠지는 선수는 혼자 치던
            선수의 레인으로 이동합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {roster.map((id) => {
            const m = playerById.get(id);
            if (!m) return null;
            const on = chosen.includes(id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center justify-between rounded border px-3 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.playerNumber}
                  </span>
                  {m.name}
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={on} onCheckedChange={() => toggle(id)} />
                  {on ? "출전" : "벤치"}
                </span>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (chosen.length !== 5) {
                toast.error("출전 5명을 선택해주세요.");
                return;
              }
              onApply(chosen);
            }}
          >
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
