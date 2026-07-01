import { cn } from "@/lib/utils";

const MEDAL: Record<number, string> = {
  1: "bg-gold text-gold-foreground",
  2: "bg-silver text-silver-foreground",
  3: "bg-bronze text-bronze-foreground",
};

/** 순위 표시: 1~3위는 금/은/동 메달 칩, 그 외는 숫자. */
export function RankMedal({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-muted-foreground">–</span>;
  if (rank >= 1 && rank <= 3) {
    return (
      <span
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-1 ring-inset ring-black/5",
          MEDAL[rank],
        )}
      >
        {rank}
      </span>
    );
  }
  return <span className="font-semibold tabular-nums">{rank}</span>;
}

/** 상위 3위 행에 입히는 옅은 메달 톤 배경 클래스. */
export function podiumRowClass(rank: number | null) {
  if (rank === 1) return "bg-gold/[0.08]";
  if (rank === 2) return "bg-silver/[0.12]";
  if (rank === 3) return "bg-bronze/[0.08]";
  return "";
}
