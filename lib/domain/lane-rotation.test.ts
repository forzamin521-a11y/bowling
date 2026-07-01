import { describe, expect, it } from "vitest";

import { laneAtGame, laneSchedule } from "./lane-rotation";

describe("laneAtGame", () => {
  const base = {
    laneStart: 3,
    laneEnd: 10,
    direction: "R" as const,
    offset: 2,
  };

  it("offset 0 이면 항상 같은 레인", () => {
    expect(
      laneAtGame({ ...base, offset: 0, baseLane: 7, gameNumber: 5 }),
    ).toBe(7);
  });

  it("레인이 1개뿐이면 항상 같은 레인", () => {
    expect(
      laneAtGame({
        baseLane: 4,
        laneStart: 4,
        laneEnd: 4,
        direction: "R",
        offset: 2,
        gameNumber: 3,
      }),
    ).toBe(4);
  });

  it("1게임은 base 레인 그대로", () => {
    expect(laneAtGame({ ...base, baseLane: 9, gameNumber: 1 })).toBe(9);
  });

  it("오른쪽 이동이 범위를 넘으면 래핑 (3~10, +2, 9번 → 2G=3)", () => {
    // span 8: (9-3 + 2*1) % 8 = 8 % 8 = 0 → +3 = 3
    expect(laneAtGame({ ...base, baseLane: 9, gameNumber: 2 })).toBe(3);
  });

  it("왼쪽 이동은 음수 래핑 처리", () => {
    // 3~10, L, +2, base 3, game2: (0 - 2) % 8 = -2 → +8 = 6 → +3 = 9
    expect(
      laneAtGame({ ...base, direction: "L", baseLane: 3, gameNumber: 2 }),
    ).toBe(9);
  });

  it("항상 사용 레인 범위 안에 머문다", () => {
    for (let g = 1; g <= 12; g++) {
      for (let b = base.laneStart; b <= base.laneEnd; b++) {
        const l = laneAtGame({ ...base, baseLane: b, gameNumber: g });
        expect(l).toBeGreaterThanOrEqual(base.laneStart);
        expect(l).toBeLessThanOrEqual(base.laneEnd);
      }
    }
  });

  it("한 게임에서 서로 다른 base 는 서로 다른 레인 (충돌 없음)", () => {
    for (let g = 1; g <= 8; g++) {
      const seen = new Set<number>();
      for (let b = base.laneStart; b <= base.laneEnd; b++) {
        seen.add(laneAtGame({ ...base, baseLane: b, gameNumber: g }));
      }
      expect(seen.size).toBe(base.laneEnd - base.laneStart + 1);
    }
  });
});

describe("laneSchedule", () => {
  it("게임 수만큼 레인 배열을 만든다", () => {
    const s = laneSchedule({
      baseLane: 9,
      laneStart: 3,
      laneEnd: 10,
      direction: "R",
      offset: 2,
      gamesCount: 3,
    });
    expect(s).toEqual([9, 3, 5]);
  });
});
