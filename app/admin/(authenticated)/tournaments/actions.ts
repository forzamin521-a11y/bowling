"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { resolveCategoryMutation } from "@/lib/domain/category-lifecycle";
import {
  requireActiveCategory,
  requireActiveEvent,
} from "@/lib/supabase/category-guards";
import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
} from "@/lib/supabase/database.types";

const tournamentSchema = z
  .object({
    name: z.string().trim().min(1, "대회명을 입력해주세요."),
    venue: z.string().trim().min(1, "장소를 입력해주세요."),
    start_date: z.string().min(1, "시작일을 선택해주세요."),
    end_date: z.string().min(1, "종료일을 선택해주세요."),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["end_date"],
  });

export type TournamentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function pickTournamentFields(formData: FormData) {
  return {
    name: formData.get("name"),
    venue: formData.get("venue"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
  };
}

function zodErrorsToFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = issue.path[0]?.toString();
    if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  return fieldErrors;
}

export async function createTournament(
  _prev: TournamentFormState | null,
  formData: FormData,
): Promise<TournamentFormState> {
  const parsed = tournamentSchema.safeParse(pickTournamentFields(formData));
  if (!parsed.success) return { fieldErrors: zodErrorsToFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "대회 생성에 실패했습니다." };
  }

  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${data.id}`);
}

export async function updateTournament(
  id: number,
  _prev: TournamentFormState | null,
  formData: FormData,
): Promise<TournamentFormState> {
  const parsed = tournamentSchema.safeParse(pickTournamentFields(formData));
  if (!parsed.success) return { fieldErrors: zodErrorsToFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/admin/tournaments");
  return {};
}

export async function deleteTournament(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/tournaments");
  redirect("/admin/tournaments");
}

/* ─────────── 종별 ─────────── */

const categoryToggleSchema = z.object({
  tournamentId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable(),
  age: z.enum(["ELEM_U10", "ELEM_U12", "MIDDLE", "HIGH", "COLLEGE", "ADULT"]),
  gender: z.enum(["M", "F"]),
  checked: z.boolean(),
});

export async function toggleCategory(input: {
  tournamentId: number;
  categoryId: number | null;
  age: CategoryAge;
  gender: Gender;
  checked: boolean;
}) {
  const parsed = categoryToggleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "종별 상태 변경 요청이 올바르지 않습니다." };
  }

  const { tournamentId, categoryId, age, gender, checked } = parsed.data;
  const supabase = await createClient();
  let existing: { id: number } | null = null;

  if (categoryId !== null) {
    const { data, error } = await supabase
      .from("tournament_categories")
      .select("id, tournament_id, age, gender")
      .eq("id", categoryId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data || data.tournament_id !== tournamentId) {
      return { error: "대회 종별 정보가 일치하지 않습니다." };
    }
    if (data.age !== age || data.gender !== gender) {
      return { error: "종별 상태 변경 요청이 일치하지 않습니다." };
    }
    existing = data;
  } else if (!checked) {
    return {};
  }

  const mutation = resolveCategoryMutation({
    categoryId: existing?.id ?? null,
    tournamentId,
    age,
    gender,
    active: checked,
  });

  if (mutation.kind === "insert") {
    const { error } = await supabase
      .from("tournament_categories")
      .insert(mutation.values);
    if (error && !error.message.includes("duplicate")) {
      return { error: error.message };
    }
  } else if (mutation.kind === "update") {
    const { error } = await supabase
      .from("tournament_categories")
      .update(mutation.patch)
      .eq("id", mutation.categoryId)
      .eq("tournament_id", tournamentId);
    if (error) return { error: error.message };
  }
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}`);
  return {};
}

/* ─────────── 세부종목 ─────────── */

const eventSchema = z
  .object({
    event_type: z.enum(["single", "double", "triple", "team5"]),
    games_count: z.coerce.number().int().min(1).max(12),
    halftime_split_at: z.coerce.number().int().min(1).max(12).optional(),
    lane_move_direction: z.enum(["L", "R"]),
    lane_move_offset: z.coerce.number().int().min(0).max(50),
    lane_start: z.coerce.number().int().min(1).max(200),
    lane_end: z.coerce.number().int().min(1).max(200),
  })
  .refine(
    (d) =>
      d.event_type !== "team5" ||
      (d.games_count >= 1 && d.games_count <= 6),
    {
      message: "5인조 게임 수는 1~6 사이여야 합니다.",
      path: ["games_count"],
    },
  )
  .refine(
    (d) =>
      d.halftime_split_at === undefined ||
      d.halftime_split_at <= d.games_count,
    { message: "분기점은 게임 수 이하여야 합니다.", path: ["halftime_split_at"] },
  )
  .refine((d) => d.lane_end >= d.lane_start, {
    message: "종료 레인이 시작 레인보다 작습니다.",
    path: ["lane_end"],
  });

export type EventFormState = TournamentFormState;

export async function addEvent(
  tournamentId: number,
  categoryId: number,
  _prev: EventFormState | null,
  formData: FormData,
): Promise<EventFormState> {
  const eventType = formData.get("event_type") as EventType;
  const isTeam5 = eventType === "team5";

  const parsed = eventSchema.safeParse({
    event_type: eventType,
    games_count: formData.get("games_count"),
    halftime_split_at: isTeam5 ? formData.get("halftime_split_at") : undefined,
    lane_move_direction: formData.get("lane_move_direction"),
    lane_move_offset: formData.get("lane_move_offset"),
    lane_start: formData.get("lane_start"),
    lane_end: formData.get("lane_end"),
  });

  if (!parsed.success) return { fieldErrors: zodErrorsToFieldErrors(parsed.error) };

  const supabase = await createClient();
  const category = await requireActiveCategory(supabase, tournamentId, categoryId);
  if ("error" in category) return { error: category.error };

  const { error } = await supabase.from("tournament_events").insert({
    tournament_category_id: categoryId,
    event_type: parsed.data.event_type,
    games_count: parsed.data.games_count,
    halftime_split_at: parsed.data.halftime_split_at ?? null,
    lane_move_direction: parsed.data.lane_move_direction,
    lane_move_offset: parsed.data.lane_move_offset,
    lane_start: parsed.data.lane_start,
    lane_end: parsed.data.lane_end,
  });
  if (error) {
    if (error.message.includes("duplicate")) {
      return { error: "이미 등록된 세부종목입니다." };
    }
    return { error: error.message };
  }
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return {};
}

export async function updateEvent(
  tournamentId: number,
  eventId: number,
  patch: {
    games_count?: number;
    halftime_split_at?: number | null;
    lane_move_direction?: LaneMoveDirection;
    lane_move_offset?: number;
    lane_start?: number | null;
    lane_end?: number | null;
  },
) {
  const supabase = await createClient();
  const event = await requireActiveEvent(supabase, tournamentId, eventId);
  if ("error" in event) return { error: event.error };

  const { error } = await supabase
    .from("tournament_events")
    .update(patch)
    .eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return {};
}

export async function deleteEvent(tournamentId: number, eventId: number) {
  const supabase = await createClient();
  const event = await requireActiveEvent(supabase, tournamentId, eventId);
  if ("error" in event) return { error: event.error };

  const { error } = await supabase
    .from("tournament_events")
    .delete()
    .eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return {};
}
