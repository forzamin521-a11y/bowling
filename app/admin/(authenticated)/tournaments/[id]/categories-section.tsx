"use client";

import { Check, PauseCircle, Plus } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-provider";
import {
  CATEGORY_AGE_LABEL,
  CATEGORY_AGE_ORDER,
  GENDER_LABEL,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { toggleCategory } from "../actions";

type RegisteredCategory = {
  id: number;
  age: CategoryAge;
  gender: Gender;
  isActive: boolean;
  playerCount: number;
  eventCount: number;
  scoreCount: number;
};

type OptimisticAction = {
  age: CategoryAge;
  gender: Gender;
  checked: boolean;
};

export function CategoriesSection({
  tournamentId,
  categories,
}: {
  tournamentId: number;
  categories: RegisteredCategory[];
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const [optimistic, applyOptimistic] = useOptimistic<
    RegisteredCategory[],
    OptimisticAction
  >(categories, (state, action) => {
    const current = state.find(
      (category) =>
        category.age === action.age && category.gender === action.gender,
    );

    if (current) {
      return state.map((category) =>
        category.id === current.id
          ? { ...category, isActive: action.checked }
          : category,
      );
    }

    if (!action.checked) return state;
    return [
      ...state,
      {
        id: -Date.now(),
        age: action.age,
        gender: action.gender,
        isActive: true,
        playerCount: 0,
        eventCount: 0,
        scoreCount: 0,
      },
    ];
  });

  const map = new Map<string, RegisteredCategory>();
  optimistic.forEach((category) =>
    map.set(`${category.age}:${category.gender}`, category),
  );

  const toggle = async (
    age: CategoryAge,
    gender: Gender,
    nextChecked: boolean,
  ) => {
    const category = map.get(`${age}:${gender}`);
    const hasData =
      (category?.playerCount ?? 0) > 0 ||
      (category?.eventCount ?? 0) > 0 ||
      (category?.scoreCount ?? 0) > 0;

    if (!nextChecked && category?.isActive && hasData) {
      const accepted = await confirm({
        title: `${CATEGORY_AGE_LABEL[age]} ${GENDER_LABEL[gender]}을 사용 중지할까요?`,
        description: (
          <>
            <span className="block">
              등록된 데이터는 삭제되지 않고 보존됩니다. 사용 중지하면 공개·운영
              화면에서 숨겨집니다.
            </span>
            <span className="mt-2 block">
              참가자 {category.playerCount}명 · 세부종목 {category.eventCount}개 ·
              점수 {category.scoreCount}건
            </span>
          </>
        ),
        confirmLabel: "사용 중지",
        destructive: false,
      });
      if (!accepted) return;
    }

    startTransition(async () => {
      applyOptimistic({ age, gender, checked: nextChecked });
      const result = await toggleCategory(
        {
          tournamentId,
          categoryId: category?.id ?? null,
          age,
          gender,
          checked: nextChecked,
        },
      );
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(
          nextChecked ? "종별을 다시 사용합니다." : "종별을 사용 중지했습니다.",
        );
      }
    });
  };

  const activeCount = optimistic.filter((category) => category.isActive).length;
  const inactiveCount = optimistic.length - activeCount;

  return (
    <div className="grid gap-3 overflow-x-auto">
      <p className="text-xs text-muted-foreground">
        활성 {activeCount}개 · 사용 중지 {inactiveCount}개 · 사용 중지해도 기존
        데이터는 보존됩니다.
      </p>
      <table
        data-category-table
        className="w-full min-w-[560px] table-fixed text-sm"
      >
        <colgroup>
          <col className="w-28" />
          <col style={{ width: "calc((100% - 7rem) / 2)" }} />
          <col style={{ width: "calc((100% - 7rem) / 2)" }} />
        </colgroup>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="w-28 pb-2 pr-4 font-medium">종별</th>
            {GENDER_ORDER.map((gender) => (
              <th key={gender} className="px-1 pb-2 text-center font-medium">
                {GENDER_LABEL[gender]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORY_AGE_ORDER.map((age) => (
            <tr key={age} className="border-b last:border-0">
              <td className="w-28 py-3 pr-4 font-medium">
                {CATEGORY_AGE_LABEL[age]}
              </td>
              {GENDER_ORDER.map((gender) => {
                const category = map.get(`${age}:${gender}`);
                const checked = category?.isActive ?? false;
                const stateLabel = !category
                  ? "미등록"
                  : checked
                    ? "사용 중"
                    : "사용 중지됨";
                const icon = !category ? (
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                ) : checked ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                );

                return (
                  <td key={gender} className="px-1 py-2">
                    <label
                      className={cn(
                        "flex min-h-16 w-full min-w-28 cursor-pointer flex-col justify-center gap-1 rounded-md border px-2.5 py-2 text-left transition-colors",
                        !category &&
                          "border-dashed border-input bg-background hover:bg-accent",
                        category &&
                          checked &&
                          "border-primary/50 bg-primary/[0.06] hover:bg-primary/10",
                        category &&
                          !checked &&
                          "border-amber-500/40 bg-amber-500/[0.06] hover:bg-amber-500/10",
                        pending && "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={pending}
                        onChange={(event) =>
                          void toggle(age, gender, event.target.checked)
                        }
                        aria-label={`${CATEGORY_AGE_LABEL[age]} ${GENDER_LABEL[gender]} ${stateLabel}`}
                      />
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                        {icon}
                        {stateLabel}
                      </span>
                      {category ? (
                        <span className="flex flex-wrap gap-x-1.5 gap-y-0.5 break-keep text-[11px] leading-tight text-muted-foreground">
                          <span className="whitespace-nowrap">
                            참가자 {category.playerCount}명
                          </span>
                          <span className="whitespace-nowrap">
                            세부종목 {category.eventCount}개
                          </span>
                          {category.scoreCount > 0 ? (
                            <span className="whitespace-nowrap">
                              점수 {category.scoreCount}건
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="break-keep text-[11px] text-muted-foreground">
                          눌러서 추가
                        </span>
                      )}
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
