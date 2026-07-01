import type {
  CategoryAge,
  EventType,
  Gender,
  LaneMoveDirection,
  TournamentStatus,
} from "@/lib/supabase/database.types";

export const CATEGORY_AGE_LABEL: Record<CategoryAge, string> = {
  ELEM_U10: "초등부 U10",
  ELEM_U12: "초등부 U12",
  MIDDLE: "중등부",
  HIGH: "고등부",
  COLLEGE: "대학부",
  ADULT: "일반부",
};

export const CATEGORY_AGE_ORDER: CategoryAge[] = [
  "ELEM_U10",
  "ELEM_U12",
  "MIDDLE",
  "HIGH",
  "COLLEGE",
  "ADULT",
];

export const GENDER_LABEL: Record<Gender, string> = {
  M: "남자",
  F: "여자",
};

/** 1~3위 메달 이모지 (입상 표시 공용). */
export const MEDAL_EMOJI: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export const GENDER_ORDER: Gender[] = ["M", "F"];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  single: "개인전",
  double: "2인조",
  triple: "3인조",
  team5: "5인조",
};

export const EVENT_TYPE_ORDER: EventType[] = [
  "single",
  "double",
  "triple",
  "team5",
];

export const LANE_MOVE_DIRECTION_LABEL: Record<LaneMoveDirection, string> = {
  L: "왼쪽",
  R: "오른쪽",
};

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  upcoming: "예정",
  ongoing: "진행중",
  finished: "종료",
};

export function categoryFullLabel(age: CategoryAge, gender: Gender) {
  return `${CATEGORY_AGE_LABEL[age]} ${GENDER_LABEL[gender]}`;
}

export function eventDefaultGamesCount(type: EventType): number {
  // 개인전/2/3인조는 보통 6게임, 5인조는 기본 4
  return type === "team5" ? 4 : 6;
}
