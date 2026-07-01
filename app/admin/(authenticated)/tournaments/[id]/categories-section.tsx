"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import {
  CATEGORY_AGE_LABEL,
  CATEGORY_AGE_ORDER,
  GENDER_LABEL,
  GENDER_ORDER,
} from "@/lib/domain/labels";
import type {
  CategoryAge,
  Gender,
} from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { toggleCategory } from "../actions";

type RegisteredCategory = {
  id: number;
  age: CategoryAge;
  gender: Gender;
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

  const [optimistic, applyOptimistic] = useOptimistic<
    RegisteredCategory[],
    OptimisticAction
  >(categories, (state, action) => {
    if (action.checked) {
      if (
        state.some(
          (c) => c.age === action.age && c.gender === action.gender,
        )
      ) {
        return state;
      }
      return [
        ...state,
        { id: -Date.now(), age: action.age, gender: action.gender },
      ];
    }
    return state.filter(
      (c) => !(c.age === action.age && c.gender === action.gender),
    );
  });

  const map = new Map<string, RegisteredCategory>();
  optimistic.forEach((c) => map.set(`${c.age}:${c.gender}`, c));

  const toggle = (
    age: CategoryAge,
    gender: Gender,
    nextChecked: boolean,
  ) => {
    startTransition(async () => {
      applyOptimistic({ age, gender, checked: nextChecked });
      const result = await toggleCategory(
        tournamentId,
        age,
        gender,
        nextChecked,
      );
      if (result?.error) toast.error(result.error);
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">종별</th>
            {GENDER_ORDER.map((g) => (
              <th
                key={g}
                className="pb-2 px-4 text-center font-medium"
              >
                {GENDER_LABEL[g]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORY_AGE_ORDER.map((age) => (
            <tr key={age} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">
                {CATEGORY_AGE_LABEL[age]}
              </td>
              {GENDER_ORDER.map((gender) => {
                const key = `${age}:${gender}`;
                const checked = map.has(key);
                return (
                  <td key={gender} className="py-3 px-4 text-center">
                    <label
                      className={cn(
                        "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent",
                        pending && "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={pending}
                        onChange={(e) =>
                          toggle(age, gender, e.target.checked)
                        }
                        aria-label={`${CATEGORY_AGE_LABEL[age]} ${GENDER_LABEL[gender]}`}
                      />
                      {checked ? (
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : null}
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
