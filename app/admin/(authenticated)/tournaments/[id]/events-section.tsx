"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Plus, Grid2x2, ClipboardList, Trophy } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_AGE_LABEL,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_ORDER,
  GENDER_LABEL,
  LANE_MOVE_DIRECTION_LABEL,
  eventDefaultGamesCount,
} from "@/lib/domain/labels";
import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
} from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import {
  addEvent,
  deleteEvent,
  type EventFormState,
} from "../actions";

import { EventEditRow } from "./event-edit-row";

type CategoryWithEvents = {
  id: number;
  age: CategoryAge;
  gender: Gender;
  events: {
    id: number;
    event_type: EventType;
    games_count: number;
    halftime_split_at: number | null;
    lane_move_direction: LaneMoveDirection;
    lane_move_offset: number;
    lane_start: number | null;
    lane_end: number | null;
  }[];
};

export function EventsSection({
  tournamentId,
  categories,
}: {
  tournamentId: number;
  categories: CategoryWithEvents[];
}) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        먼저 위에서 등록할 종별을 선택해주세요.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {categories.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {CATEGORY_AGE_LABEL[c.age]} {GENDER_LABEL[c.gender]}
            </CardTitle>
            <CardAction>
              <Link
                href={`/admin/tournaments/${tournamentId}/rankings/${c.id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1",
                )}
              >
                <Trophy className="h-4 w-4" />
                순위
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            {c.events.length > 0 && (
              <ul className="grid gap-2">
                {c.events.map((e) => (
                  <EventRow
                    key={e.id}
                    tournamentId={tournamentId}
                    categoryId={c.id}
                    event={e}
                  />
                ))}
              </ul>
            )}
            <AddEventInline
              tournamentId={tournamentId}
              categoryId={c.id}
              existingTypes={new Set(c.events.map((e) => e.event_type))}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EventRow({
  tournamentId,
  categoryId,
  event,
}: {
  tournamentId: number;
  categoryId: number;
  event: CategoryWithEvents["events"][number];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <EventEditRow
          tournamentId={tournamentId}
          event={event}
          onClose={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <span className="font-medium">{EVENT_TYPE_LABEL[event.event_type]}</span>
        <span className="ml-2 text-muted-foreground">
          {event.games_count}게임
          {event.event_type === "team5" && event.halftime_split_at !== null
            ? ` · 전반 ${event.halftime_split_at}G / 후반 ${event.games_count - event.halftime_split_at}G`
            : ""}
          {" · 사용 레인 "}
          {event.lane_start !== null && event.lane_end !== null
            ? `${event.lane_start}~${event.lane_end}`
            : "미설정"}
          {" · 레인이동 "}
          {event.lane_move_offset === 0
            ? "없음"
            : `${LANE_MOVE_DIRECTION_LABEL[event.lane_move_direction]} ${event.lane_move_offset}칸`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={`/admin/tournaments/${tournamentId}/events/${event.id}/lanes`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1",
          )}
        >
          <Grid2x2 className="h-4 w-4" />
          {event.event_type === "single" ? "레인 배정" : "레인·팀 배정"}
        </Link>
        <Link
          href={`/admin/tournaments/${tournamentId}/events/${event.id}/scores`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1",
          )}
        >
          <ClipboardList className="h-4 w-4" />
          점수 입력
        </Link>
        <Link
          href={`/tournaments/${tournamentId}/${categoryId}/${event.id}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1",
          )}
        >
          <Trophy className="h-4 w-4" />
          순위
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          수정
        </Button>
        <DeleteEventButton
          tournamentId={tournamentId}
          eventId={event.id}
        />
      </div>
    </li>
  );
}

function DeleteEventButton({
  tournamentId,
  eventId,
}: {
  tournamentId: number;
  eventId: number;
}) {
  const onDelete = async () => {
    const r = await deleteEvent(tournamentId, eventId);
    if (r?.error) toast.error(r.error);
  };

  return (
    <ConfirmDialog
      title="세부종목을 삭제할까요?"
      description="이 세부종목의 레인 배정·점수·랭킹이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
      confirmLabel="삭제"
      onConfirm={onDelete}
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label="삭제">
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    />
  );
}

function AddEventInline({
  tournamentId,
  categoryId,
  existingTypes,
}: {
  tournamentId: number;
  categoryId: number;
  existingTypes: Set<EventType>;
}) {
  const remaining = EVENT_TYPE_ORDER.filter((t) => !existingTypes.has(t));
  const [open, setOpen] = useState(false);
  const initialType = remaining[0] ?? "single";
  const [eventType, setEventType] = useState<EventType>(initialType);
  const [gamesCount, setGamesCount] = useState<number>(
    eventDefaultGamesCount(initialType),
  );
  const [splitAt, setSplitAt] = useState<number>(
    Math.ceil(eventDefaultGamesCount("team5") / 2),
  );

  const action = addEvent.bind(null, tournamentId, categoryId);
  const [state, formAction] = useActionState<EventFormState | null, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state && !state.error && !state.fieldErrors) {
      setOpen(false);
    }
    if (state?.error) toast.error(state.error);
  }, [state]);

  if (remaining.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        모든 세부종목이 추가되었습니다.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-fit gap-1"
      >
        <Plus className="h-4 w-4" />
        세부종목 추가
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`event_type-${categoryId}`}>세부종목</Label>
          <Select
            name="event_type"
            value={eventType}
            onValueChange={(v) => {
              const t = v as EventType;
              setEventType(t);
              setGamesCount(eventDefaultGamesCount(t));
            }}
          >
            <SelectTrigger id={`event_type-${categoryId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {remaining.map((t) => (
                <SelectItem key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`games_count-${categoryId}`}>게임 수</Label>
          <Select
            name="games_count"
            value={String(gamesCount)}
            onValueChange={(v) => {
              const n = Number(v);
              setGamesCount(n);
              if (splitAt > n) setSplitAt(Math.ceil(n / 2));
            }}
          >
            <SelectTrigger id={`games_count-${categoryId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(eventType === "team5"
                ? [1, 2, 3, 4, 5, 6]
                : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
              ).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}게임
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {eventType === "team5" ? (
          <div className="grid gap-2">
            <Label htmlFor={`halftime_split_at-${categoryId}`}>
              전반전 끝 게임
            </Label>
            <Select
              name="halftime_split_at"
              value={String(splitAt)}
              onValueChange={(v) => setSplitAt(Number(v))}
            >
              <SelectTrigger id={`halftime_split_at-${categoryId}`}>
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
          <Label htmlFor={`lane_start-${categoryId}`}>사용 레인 시작</Label>
          <Input
            id={`lane_start-${categoryId}`}
            name="lane_start"
            type="number"
            min={1}
            defaultValue={1}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`lane_end-${categoryId}`}>사용 레인 끝</Label>
          <Input
            id={`lane_end-${categoryId}`}
            name="lane_end"
            type="number"
            min={1}
            defaultValue={8}
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`lane_move_direction-${categoryId}`}>
            레인 이동 방향
          </Label>
          <Select name="lane_move_direction" defaultValue="R">
            <SelectTrigger id={`lane_move_direction-${categoryId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="R">오른쪽</SelectItem>
              <SelectItem value="L">왼쪽</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`lane_move_offset-${categoryId}`}>
            레인 이동 칸 수 (0 = 이동 없음)
          </Label>
          <Input
            id={`lane_move_offset-${categoryId}`}
            name="lane_move_offset"
            type="number"
            min={0}
            defaultValue={0}
            required
          />
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitInline />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
      </div>
    </form>
  );
}

function SubmitInline() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      {pending ? "추가 중..." : "추가"}
    </Button>
  );
}
