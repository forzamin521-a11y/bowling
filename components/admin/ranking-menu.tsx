"use client";

import Link from "next/link";
import { ChevronDown, Trophy } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 관리자 운영 페이지에서 두 종류의 순위 보기를 하나로 묶은 보조 메뉴. */
export function RankingMenu({
  overallHref,
  eventHref,
}: {
  overallHref: string;
  eventHref: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "outline" }), "gap-1")}
      >
        <Trophy className="h-4 w-4" />
        순위 보기
        <ChevronDown className="h-4 w-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem render={<Link href={overallHref} />}>
          대회 전체 순위
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={eventHref} />}>
          이 종목 순위 (공개 화면)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
