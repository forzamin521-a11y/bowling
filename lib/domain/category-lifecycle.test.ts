import { describe, expect, it } from "vitest";

import { resolveCategoryMutation } from "./category-lifecycle";
import { validateActiveCategory } from "../supabase/category-guards";

describe("resolveCategoryMutation", () => {
  it("creates a new active category when none exists", () => {
    expect(
      resolveCategoryMutation({
        categoryId: null,
        tournamentId: 2,
        age: "HIGH",
        gender: "M",
        active: true,
      }),
    ).toEqual({
      kind: "insert",
      values: { tournament_id: 2, age: "HIGH", gender: "M", is_active: true },
    });
  });

  it("reactivates an existing inactive category without creating a new row", () => {
    expect(
      resolveCategoryMutation({
        categoryId: 17,
        tournamentId: 2,
        age: "HIGH",
        gender: "M",
        active: true,
      }),
    ).toEqual({
      kind: "update",
      categoryId: 17,
      patch: { is_active: true },
    });
  });

  it("deactivates an existing category with an update instead of a delete", () => {
    expect(
      resolveCategoryMutation({
        categoryId: 17,
        tournamentId: 2,
        age: "HIGH",
        gender: "M",
        active: false,
      }),
    ).toEqual({
      kind: "update",
      categoryId: 17,
      patch: { is_active: false },
    });
  });

  it("does nothing when an unknown category is requested as inactive", () => {
    expect(
      resolveCategoryMutation({
        categoryId: null,
        tournamentId: 2,
        age: "HIGH",
        gender: "M",
        active: false,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("rejects writes to a category that is not active", () => {
    expect(
      validateActiveCategory(
        { id: 17, tournament_id: 2, is_active: false },
        2,
      ),
    ).toEqual({
      error: "사용 중지된 종별입니다. 대회 상세에서 다시 활성화해주세요.",
    });
  });

  it("accepts writes to an active category in the same tournament", () => {
    expect(
      validateActiveCategory(
        { id: 17, tournament_id: 2, is_active: true },
        2,
      ),
    ).toEqual({ ok: true });
  });
});
