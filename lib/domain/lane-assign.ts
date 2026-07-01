/**
 * 랜덤 레인 배정 — 모든 레인에 거의 균등한 인원이 가도록 분산.
 *
 * 원칙(기획안 5.6):
 *  - 팀은 반드시 같은 레인 (원자 단위)
 *  - 미편성 선수는 개별 분산
 *  - 레인별 인원 편차 최소화 (가능하면 ≤ 1)
 *  - 하드 캡: 한 레인 maxPerLane (기본 6). 초과 시 경고만 반환.
 */
export type AssignTeam = { id: number; size: number };

export type LaneAssignResult = {
  teamLane: Record<number, number>; // teamId -> lane number
  playerLane: Record<number, number>; // playerId -> lane number
  warnings: string[];
};

export function randomLaneAssign(params: {
  lanes: number[];
  teams: AssignTeam[];
  loosePlayerIds: number[];
  maxPerLane: number;
  rng?: () => number;
}): LaneAssignResult {
  const { lanes, teams, loosePlayerIds, maxPerLane } = params;
  const rng = params.rng ?? Math.random;

  const teamLane: Record<number, number> = {};
  const playerLane: Record<number, number> = {};
  const warnings: string[] = [];

  if (lanes.length === 0) {
    warnings.push("사용 레인이 설정되지 않았습니다.");
    return { teamLane, playerLane, warnings };
  }

  const counts = lanes.map(() => 0);

  function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 캡을 넘지 않는 선에서 결과 인원이 가장 적어질 레인. 모두 초과면 전역 최소.
  function pickLane(addSize: number): number {
    let best = -1;
    let bestCount = Infinity;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] + addSize > maxPerLane) continue;
      if (counts[i] < bestCount) {
        bestCount = counts[i];
        best = i;
      }
    }
    if (best === -1) {
      for (let i = 0; i < counts.length; i++) {
        if (counts[i] < bestCount) {
          bestCount = counts[i];
          best = i;
        }
      }
    }
    return best;
  }

  // 팀 먼저 (큰 팀일수록 자리 차지가 크므로 균등화에 유리)
  const orderedTeams = shuffle(teams).sort((a, b) => b.size - a.size);
  for (const t of orderedTeams) {
    const idx = pickLane(t.size);
    teamLane[t.id] = lanes[idx];
    counts[idx] += t.size;
  }
  for (const pid of shuffle(loosePlayerIds)) {
    const idx = pickLane(1);
    playerLane[pid] = lanes[idx];
    counts[idx] += 1;
  }

  const total =
    teams.reduce((s, t) => s + t.size, 0) + loosePlayerIds.length;
  if (total > lanes.length * maxPerLane) {
    warnings.push(
      `총 인원 ${total}명 > 사용 레인 ${lanes.length} × ${maxPerLane}명 = ${lanes.length * maxPerLane}석. 사용 레인이 부족합니다.`,
    );
  }
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > maxPerLane) {
      warnings.push(`${lanes[i]}번 레인 ${counts[i]}명 (최대 ${maxPerLane} 초과)`);
    }
  }

  return { teamLane, playerLane, warnings };
}
