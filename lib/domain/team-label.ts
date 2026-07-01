/**
 * 팀 라벨(A, B, C…) 계산 — 클라이언트 미리보기용.
 * 서버 `recalc_team_labels()` 와 동일 규칙:
 *   같은 (시군 + 소속) 그룹 안에서 등록 순서 1~6 → A, 7~12 → B, 13~18 → C …
 */
export function teamLabelForPosition(position: number): string {
  if (position < 1) return "";
  return String.fromCharCode(65 + Math.floor((position - 1) / 6));
}

/** 그룹 키 (시군 + 소속). 라벨은 이 그룹 단위로 재계산된다. */
export function groupKey(regionId: number, affiliationName: string): string {
  return `${regionId}:${affiliationName.trim()}`;
}
