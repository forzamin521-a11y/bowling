"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type Region = { id: number; name: string };

const ALL_VALUE = "all";

export function RegionCombobox({
  id,
  regions,
  value,
  onChange,
  placeholder = "시/군 선택",
  allLabel,
  className,
}: {
  id?: string;
  regions: Region[];
  value: string; // 선택된 시/군 id (문자열). allLabel 사용 시 "all" = 전체. "" = 미선택
  onChange: (id: string) => void;
  placeholder?: string;
  allLabel?: string; // 지정하면 목록 맨 위에 "전체" 옵션 추가 (value = "all")
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 가나다 정렬 + (옵션) 전체 항목
  const items = useMemo(() => {
    const base = [...regions]
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((r) => ({ value: String(r.id), name: r.name }));
    return allLabel ? [{ value: ALL_VALUE, name: allLabel }, ...base] : base;
  }, [regions, allLabel]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? items.filter((it) => it.name.includes(q)) : items;
  }, [items, query]);

  const selectedName = items.find((it) => it.value === value)?.name ?? "";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 검색어가 바뀌면 첫 항목으로
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 활성 항목을 보이게 스크롤 (키보드 전용)
  useEffect(() => {
    if (open) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[activeIndex];
      if (it) choose(it.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
      >
        <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
          {selectedName || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[10rem] rounded-md border bg-popover shadow-md">
          <div className="flex items-center gap-1.5 border-b px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="검색 (↑↓ 이동, Enter 선택)"
              className="h-8 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                결과 없음
              </li>
            ) : (
              filtered.map((it, idx) => {
                const selected = it.value === value;
                const active = idx === activeIndex;
                return (
                  <li key={it.value}>
                    <button
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      onClick={() => choose(it.value)}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent",
                        selected && !active && "font-medium",
                      )}
                    >
                      {it.name}
                      {selected ? <Check className="h-4 w-4" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
