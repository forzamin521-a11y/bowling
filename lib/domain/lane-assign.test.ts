import { describe, expect, it } from "vitest";

import { randomLaneAssign } from "./lane-assign";

// 결정적 테스트용: 셔플이 항상 a[i]<->a[0] 스왑만 하도록 0 반환
const rng0 = () => 0;

describe("randomLaneAssign", () => {
  it("모든 팀과 개인을 사용 레인 안에 배정한다", () => {
    const lanes = [3, 4, 5, 6];
    const res = randomLaneAssign({
      lanes,
      teams: [
        { id: 1, size: 2 },
        { id: 2, size: 3 },
      ],
      loosePlayerIds: [10, 11, 12],
      maxPerLane: 6,
      rng: rng0,
    });
    for (const lane of Object.values(res.teamLane)) {
      expect(lanes).toContain(lane);
    }
    for (const lane of Object.values(res.playerLane)) {
      expect(lanes).toContain(lane);
    }
    expect(Object.keys(res.teamLane)).toHaveLength(2);
    expect(Object.keys(res.playerLane)).toHaveLength(3);
  });

  it("개인전(개인만)이면 레인 인원 편차가 1 이하", () => {
    const lanes = [1, 2, 3, 4];
    const res = randomLaneAssign({
      lanes,
      teams: [],
      loosePlayerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      maxPerLane: 6,
      rng: rng0,
    });
    const counts = new Map<number, number>();
    for (const l of lanes) counts.set(l, 0);
    for (const lane of Object.values(res.playerLane)) {
      counts.set(lane, (counts.get(lane) ?? 0) + 1);
    }
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    expect(res.warnings).toHaveLength(0);
  });

  it("총 인원이 좌석 수를 넘으면 경고", () => {
    const res = randomLaneAssign({
      lanes: [1],
      teams: [],
      loosePlayerIds: [1, 2, 3],
      maxPerLane: 2,
      rng: rng0,
    });
    // 모두 1번 레인 (다른 선택지 없음)
    expect(Object.values(res.playerLane)).toEqual([1, 1, 1]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("같은 팀은 한 레인에 통째로 배정 (size 만큼 좌석 차지)", () => {
    const lanes = [1, 2];
    const res = randomLaneAssign({
      lanes,
      teams: [{ id: 99, size: 5 }],
      loosePlayerIds: [],
      maxPerLane: 6,
      rng: rng0,
    });
    expect(lanes).toContain(res.teamLane[99]);
  });

  it("사용 레인이 없으면 경고만 반환", () => {
    const res = randomLaneAssign({
      lanes: [],
      teams: [{ id: 1, size: 2 }],
      loosePlayerIds: [1],
      maxPerLane: 6,
      rng: rng0,
    });
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(Object.keys(res.teamLane)).toHaveLength(0);
  });
});
