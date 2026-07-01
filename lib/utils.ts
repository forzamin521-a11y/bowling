import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 점수 천 단위 구분 표시 (예: 1234 → "1,234", -1234 → "-1,234"). */
export function fmtScore(n: number): string {
  return n.toLocaleString("en-US")
}

/** 평균 표시 (소수점 1자리 통일). null이면 "–". */
export function fmtAvg(avg: number | null | undefined): string {
  return avg == null ? "–" : avg.toFixed(1)
}
