import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/** 경로 표시 (목록 → 대회 → 종별 → 세부종목). 공개/관리자 공용. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="페이지 경로"
      className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground"
    >
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {item.href && !last ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(last && "font-medium text-foreground")}
                aria-current={last ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
            {!last && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            )}
          </span>
        );
      })}
    </nav>
  );
}
