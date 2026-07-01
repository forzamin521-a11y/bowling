"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/supabase/database.types";

import {
  createTournament,
  updateTournament,
  type TournamentFormState,
} from "./actions";

type TournamentRow = Database["public"]["Tables"]["tournaments"]["Row"];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "저장 중..." : label}
    </Button>
  );
}

export function TournamentForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: TournamentRow;
}) {
  const action =
    mode === "edit" && initial
      ? updateTournament.bind(null, initial.id)
      : createTournament;

  const [state, formAction] = useActionState<
    TournamentFormState | null,
    FormData
  >(action, null);

  useEffect(() => {
    if (mode === "edit" && state && !state.error && !state.fieldErrors) {
      if (state !== null) toast.success("저장되었습니다.");
    }
  }, [state, mode]);

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">대회명</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initial?.name ?? ""}
          required
        />
        {fe.name && <p className="text-sm text-destructive">{fe.name}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="venue">장소</Label>
        <Input
          id="venue"
          name="venue"
          defaultValue={initial?.venue ?? ""}
          required
        />
        {fe.venue && <p className="text-sm text-destructive">{fe.venue}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="start_date">시작일</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={initial?.start_date ?? ""}
            required
          />
          {fe.start_date && (
            <p className="text-sm text-destructive">{fe.start_date}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="end_date">종료일</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={initial?.end_date ?? ""}
            required
          />
          {fe.end_date && (
            <p className="text-sm text-destructive">{fe.end_date}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        사용 레인(시작/끝)과 레인 이동 규칙(방향·칸 수)은 각 세부종목 단위로 따로 설정합니다.
      </p>

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div>
        <SubmitButton label={mode === "create" ? "대회 생성" : "저장"} />
      </div>
    </form>
  );
}
