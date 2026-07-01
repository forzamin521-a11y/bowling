/**
 * 조(squad) 분반 — 관리자가 조마다 "선수 번호 구간"을 직접 지정한다.
 *   예) 1조: 1~36번, 2조: 37~71번
 *
 * 자동 균등분배·용량(레인수×6) 규칙은 쓰지 않는다. 오직 지정한 번호 범위로만 배정.
 * 같은 팀이 서로 다른 조로 갈리면 splitTeamIds 로 보고(경고용).
 * 어느 범위에도 안 들어가는 선수는 unassignedIds 로 보고.
 */
export type SplitPlayer = {
  id: number;
  number: number;
  teamId: number | null;
};

export type SquadRange = { from: number; to: number };

export type RangeSplitResult = {
  squadOfPlayer: Record<number, number>; // playerId -> 조 번호 (1-based)
  unassignedIds: number[]; // 어느 구간에도 안 들어간 선수
  splitTeamIds: number[]; // 서로 다른 조로 갈린 팀
};

export function squadSplitByRanges(params: {
  players: SplitPlayer[];
  ranges: SquadRange[];
}): RangeSplitResult {
  const { players, ranges } = params;
  const squadOfPlayer: Record<number, number> = {};
  const unassignedIds: number[] = [];

  for (const p of players) {
    // 첫 번째로 포함하는 구간에 배정
    const idx = ranges.findIndex(
      (r) => p.number >= r.from && p.number <= r.to,
    );
    if (idx === -1) unassignedIds.push(p.id);
    else squadOfPlayer[p.id] = idx + 1;
  }

  const squadsByTeam = new Map<number, Set<number>>();
  for (const p of players) {
    if (p.teamId == null) continue;
    const sq = squadOfPlayer[p.id];
    if (sq == null) continue;
    const set = squadsByTeam.get(p.teamId) ?? new Set<number>();
    set.add(sq);
    squadsByTeam.set(p.teamId, set);
  }
  const splitTeamIds = [...squadsByTeam.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([t]) => t);

  return { squadOfPlayer, unassignedIds, splitTeamIds };
}

/**
 * 편집 시작값용 기본 범위 — 실제 선수 번호를 N개 조로 인원수 균등 연속 분할.
 * (관리자가 이후 자유롭게 수정한다. 자동 규칙이 아니라 단순 프리필.)
 */
export function defaultRanges(
  numbers: number[],
  squadCount: number,
): SquadRange[] {
  const N = Math.max(1, squadCount);
  const sorted = [...numbers].sort((a, b) => a - b);
  const total = sorted.length;
  if (total === 0) {
    return Array.from({ length: N }, () => ({ from: 0, to: 0 }));
  }
  if (N === 1) return [{ from: sorted[0], to: sorted[total - 1] }];

  const base = Math.floor(total / N);
  const rem = total % N;
  const ranges: SquadRange[] = [];
  let idx = 0;
  for (let g = 0; g < N; g++) {
    const size = base + (g < rem ? 1 : 0);
    const endIdx = Math.min(total - 1, idx + size - 1);
    ranges.push({ from: sorted[idx], to: sorted[endIdx] });
    idx += size;
  }
  return ranges;
}
