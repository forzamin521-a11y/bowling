"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 모든 페이지 우상단에 고정되는 전역 컨트롤.
 * - 테마 토글: 항상 표시
 * - 관리자 링크: 공개 페이지에서만 표시(관리자 영역에선 사이드바가 있으므로 숨김)
 */
const floatingClass =
  "border border-border/60 bg-background/70 shadow-sm backdrop-blur hover:bg-muted";

export function TopControls() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  return (
    <div className="fixed right-3 top-3 z-40 flex items-center gap-1 print:hidden">
      {!isAdmin && (
        <Link
          href="/admin"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            floatingClass,
          )}
        >
          관리자
        </Link>
      )}
      <ThemeToggle className={floatingClass} />
    </div>
  );
}
