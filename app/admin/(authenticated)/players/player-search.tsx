"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ChevronRight, Search } from "lucide-react";

import { RegionCombobox } from "@/components/admin/region-combobox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  categoryFullLabel,
  GENDER_LABEL,
} from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import type { CategoryAge, Gender } from "@/lib/supabase/database.types";

import { searchMasterPlayers, type MasterPlayerResult } from "./actions";

type Region = { id: number; name: string };
export type CategoryOption = { age: CategoryAge; gender: Gender };

const ALL = "all";
const catKey = (c: CategoryOption) => `${c.age}:${c.gender}`;

export function PlayerSearch({
  regions,
  categories,
}: {
  regions: Region[];
  categories: CategoryOption[];
}) {
  const [category, setCategory] = useState<string>(ALL);
  const [regionId, setRegionId] = useState("all");
  const [affiliation, setAffiliation] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<MasterPlayerResult[]>([]);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  const regionName = (id: number) =>
    regions.find((r) => r.id === id)?.name ?? "";

  // 필터 변경 시 디바운스 검색
  useEffect(() => {
    const t = setTimeout(() => {
      const active =
        category === ALL ? null : categories.find((c) => catKey(c) === category);
      startTransition(async () => {
        const res = await searchMasterPlayers({
          regionId: regionId === "all" ? undefined : Number(regionId),
          affiliation: affiliation.trim() || undefined,
          name: name.trim() || undefined,
          age: active?.age,
          gender: active?.gender,
        });
        setResults(res);
        setLoaded(true);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [category, categories, regionId, affiliation, name]);

  return (
    <div className="grid gap-4">
      {categories.length > 0 ? (
        <div className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground">
          <CategoryTab
            label="전체"
            active={category === ALL}
            onClick={() => setCategory(ALL)}
          />
          {categories.map((c) => {
            const key = catKey(c);
            return (
              <CategoryTab
                key={key}
                label={categoryFullLabel(c.age, c.gender)}
                active={category === key}
                onClick={() => setCategory(key)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <RegionCombobox
          regions={regions}
          value={regionId}
          onChange={setRegionId}
          allLabel="전체 시/군"
        />
        <Input
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          placeholder="소속 검색"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 검색"
        />
      </div>

      {loaded && results.length > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {results.length === 50 ? "50명 이상" : `${results.length}명`}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {!loaded ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Search className="h-4 w-4 animate-pulse" />
              검색 중...
            </p>
          ) : results.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {results.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/players/${p.id}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent",
                      pending && "opacity-60",
                    )}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {p.name.trim().slice(0, 1) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.gender ? (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {GENDER_LABEL[p.gender]}
                            {p.birthYear ? ` · ${p.birthYear}` : ""}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {regionName(p.regionId)} · {p.affiliationName}
                        <span
                          className="ml-1 font-mono opacity-60"
                          title="선수 고유 ID (모든 대회에서 불변)"
                        >
                          ID #{p.id}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                      <span className="text-xs tabular-nums">
                        참가 {p.participationCount}회
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {loaded && results.length === 50 ? (
        <p className="text-xs text-muted-foreground">
          상위 50명만 표시됩니다. 검색어로 좁혀주세요.
        </p>
      ) : null}
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
