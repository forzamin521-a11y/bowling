"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

import { searchAffiliations } from "./actions";

export function AffiliationCombobox({
  id,
  regionId,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string;
  regionId: number | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 입력값 변화에 따라 같은 시/군의 소속을 부분일치로 추천 (디바운스)
  useEffect(() => {
    const term = value.trim();
    if (!regionId || term.length === 0) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchAffiliations(regionId, term);
      setSuggestions(res.filter((s) => s !== term));
    }, 200);
    return () => clearTimeout(t);
  }, [regionId, value]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled || !regionId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
