"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Trophy,
  Users,
  UserCircle,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { signOut } from "@/app/admin/actions";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard, exact: true },
  { href: "/admin/tournaments", label: "대회 관리", icon: Trophy },
  { href: "/admin/players", label: "선수 관리", icon: Users },
  { href: "/admin/account", label: "계정", icon: UserCircle },
];

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 경로 이동 시 모바일 드로어 자동 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* 데스크톱 고정 사이드바 (lg 이상) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarBody userEmail={userEmail} pathname={pathname} />
      </aside>

      {/* 모바일/태블릿 상단바 (lg 미만) */}
      <header className="flex shrink-0 items-center gap-2 border-b bg-sidebar px-3 py-2.5 text-sidebar-foreground lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Trophy className="h-4 w-4" />
        </span>
        <h1 className="text-sm font-semibold">경기도볼링협회 관리자</h1>
      </header>

      {/* 모바일 드로어 */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[82%] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarBody userEmail={userEmail} pathname={pathname} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarBody({
  userEmail,
  pathname,
}: {
  userEmail: string;
  pathname: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Trophy className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">경기도볼링협회</p>
          <h1 className="text-base font-semibold leading-tight">관리자</h1>
        </div>
      </div>
      <Separator />
      <nav className="flex-1 px-2 py-3">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary" />
              )}
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <Separator />
      <div className="px-3 py-3">
        <Link
          href="/"
          target="_blank"
          className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50"
        >
          <ExternalLink className="h-4 w-4" />
          공개 페이지
        </Link>
        <p className="truncate px-2 text-xs text-muted-foreground">
          {userEmail}
        </p>
        <form action={signOut} className="mt-2">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </form>
      </div>
    </>
  );
}
