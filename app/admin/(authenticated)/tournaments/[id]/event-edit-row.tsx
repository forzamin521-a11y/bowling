"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPE_LABEL } from "@/lib/domain/labels";
import type {
  EventType,
  LaneMoveDirection,
} from "@/lib/supabase/database.types";

import { updateEvent } from "../actions";

export function EventEditRow({
  tournamentId,
  event,
  onClose,
}: {
  tournamentId: number;
  event: {
    id: number;
    event_type: EventType;
    games_count: number;
    halftime_split_at: number | null;
    lane_move_direction: LaneMoveDirection;
    lane_move_offset: number;
    lane_start: number | null;
    lane_end: number | null;
  };
  onClose: () => void;
}) {
  const [gamesCount, setGamesCount] = useState<number>(event.games_count);
  const [splitAt, setSplitAt] = useState<number>(
    event.halftime_split_at ?? Math.ceil(event.games_count / 2),
  );
  const [direction, setDirection] = useState<LaneMoveDirection>(
    event.lane_move_direction,
  );
  const [offset, setOffset] = useState<number>(event.lane_move_offset);
  const [laneStart, setLaneStart] = useState<number>(event.lane_start ?? 1);
  const [laneEnd, setLaneEnd] = useState<number>(event.lane_end ?? 8);
  const [pending, startTransition] = useTransition();

  const isTeam5 = event.event_type === "team5";
  const gamesOptions = isTeam5
    ? [1, 2, 3, 4, 5, 6]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const onSave = () => {
    if (laneEnd < laneStart) {
      toast.error("종료 레인이 시작 레인보다 작습니다.");
      return;
    }
    startTransition(async () => {
      const r = await updateEvent(tournamentId, event.id, {
        games_count: gamesCount,
        halftime_split_at: isTeam5 ? splitAt : null,
        lane_move_direction: direction,
        lane_move_offset: offset,
        lane_start: laneStart,
        lane_end: laneEnd,
      });
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      toast.success("저장되었습니다.");
      onClose();
    });
  };

  return (
    <div className="grid gap-3 rounded-md border bg-card p-3">
      <p className="text-sm font-medium">
        {EVENT_TYPE_LABEL[event.event_type]} 수정
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>게임 수</Label>
          <Select
            value={String(gamesCount)}
            onValueChange={(v) => {
              const n = Number(v);
              setGamesCount(n);
              if (splitAt > n) setSplitAt(Math.ceil(n / 2));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gamesOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}게임
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isTeam5 ? (
          <div className="grid gap-2">
            <Label>전반전 끝 게임</Label>
            <Select
              value={String(splitAt)}
              onValueChange={(v) => setSplitAt(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: gamesCount }, (_, i) => i + 1).map(
                  (n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}게임까지
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>사용 레인 시작</Label>
          <Input
            type="number"
            min={1}
            value={laneStart}
            onChange={(e) => setLaneStart(Number(e.target.value))}
          />
        </div>
        <div className="grid gap-2">
          <Label>사용 레인 끝</Label>
          <Input
            type="number"
            min={1}
            value={laneEnd}
            onChange={(e) => setLaneEnd(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>레인 이동 방향</Label>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as LaneMoveDirection)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="R">오른쪽</SelectItem>
              <SelectItem value="L">왼쪽</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>레인 이동 칸 수 (0 = 이동 없음)</Label>
          <Input
            type="number"
            min={0}
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={pending}>
          {pending ? "저장 중..." : "저장"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
