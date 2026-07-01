/**
 * 게임별 실제 레인 계산 — DB `lane_at_game()` 와 동일한 래핑 순환.
 *
 * 사용 레인 범위 [laneStart, laneEnd] 안에서, 매 게임 offset 칸씩
 * direction 방향으로 이동하고 범위를 벗어나면 반대편으로 래핑된다.
 *
 * 예) 3~10, 오른쪽 2칸: 1G 9번 → 2G 11 → 래핑 → 3번
 */
export function laneAtGame(params: {
  baseLane: number;
  laneStart: number;
  laneEnd: number;
  direction: "L" | "R";
  offset: number;
  gameNumber: number;
}): number {
  const { baseLane, laneStart, laneEnd, direction, offset, gameNumber } =
    params;
  const span = laneEnd - laneStart + 1;
  if (offset === 0 || span <= 1) return baseLane;

  const dir = direction === "R" ? 1 : -1;
  let pos = (baseLane - laneStart + dir * offset * (gameNumber - 1)) % span;
  if (pos < 0) pos += span;
  return pos + laneStart;
}

/** 1G..gamesCount 각 게임의 레인 번호 배열. */
export function laneSchedule(params: {
  baseLane: number;
  laneStart: number;
  laneEnd: number;
  direction: "L" | "R";
  offset: number;
  gamesCount: number;
}): number[] {
  const { gamesCount, ...rest } = params;
  return Array.from({ length: gamesCount }, (_, i) =>
    laneAtGame({ ...rest, gameNumber: i + 1 }),
  );
}
