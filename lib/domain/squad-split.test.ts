import { describe, expect, it } from "vitest";

import { defaultRanges, squadSplitByRanges } from "./squad-split";

describe("squadSplitByRanges", () => {
  it("지정한 번호 구간으로 배정", () => {
    const players = [
      { id: 1, number: 5, teamId: null },
      { id: 2, number: 36, teamId: null },
      { id: 3, number: 37, teamId: null },
      { id: 4, number: 70, teamId: null },
    ];
    const res = squadSplitByRanges({
      players,
      ranges: [
        { from: 1, to: 36 },
        { from: 37, to: 71 },
      ],
    });
    expect(res.squadOfPlayer).toEqual({ 1: 1, 2: 1, 3: 2, 4: 2 });
    expect(res.unassignedIds).toEqual([]);
  });

  it("어느 구간에도 없으면 unassigned", () => {
    const res = squadSplitByRanges({
      players: [
        { id: 1, number: 5, teamId: null },
        { id: 2, number: 99, teamId: null },
      ],
      ranges: [{ from: 1, to: 36 }],
    });
    expect(res.squadOfPlayer).toEqual({ 1: 1 });
    expect(res.unassignedIds).toEqual([2]);
  });

  it("팀이 구간을 넘어 갈리면 splitTeamIds 로 보고", () => {
    const players = [
      { id: 1, number: 36, teamId: 99 },
      { id: 2, number: 37, teamId: 99 },
      { id: 3, number: 1, teamId: 1 },
      { id: 4, number: 2, teamId: 1 },
    ];
    const res = squadSplitByRanges({
      players,
      ranges: [
        { from: 1, to: 36 },
        { from: 37, to: 71 },
      ],
    });
    expect(res.splitTeamIds).toContain(99);
    expect(res.splitTeamIds).not.toContain(1);
  });
});

describe("defaultRanges", () => {
  it("N=1 이면 전체 범위 하나", () => {
    expect(defaultRanges([3, 1, 2], 1)).toEqual([{ from: 1, to: 3 }]);
  });

  it("71명 2조 → 1~36 / 37~71", () => {
    const numbers = Array.from({ length: 71 }, (_, i) => i + 1);
    const r = defaultRanges(numbers, 2);
    expect(r).toEqual([
      { from: 1, to: 36 },
      { from: 37, to: 71 },
    ]);
  });

  it("선수 없으면 0 범위", () => {
    expect(defaultRanges([], 2)).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 0 },
    ]);
  });
});
