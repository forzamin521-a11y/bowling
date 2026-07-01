"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, TriangleAlert, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GENDER_LABEL } from "@/lib/domain/labels";
import { groupKey, teamLabelForPosition } from "@/lib/domain/team-label";
import { cn } from "@/lib/utils";

import {
  checkPlayerMatches,
  registerPlayers,
  type NameMatch,
} from "./actions";
import { RegionCombobox } from "@/components/admin/region-combobox";

import { AffiliationCombobox } from "./affiliation-combobox";

type Region = { id: number; name: string };
type Choice = number | "new";
type Entry = { name: string; playerId: number | null };

export function RegistrationForm({
  tournamentId,
  regions,
  groupCounts,
}: {
  tournamentId: number;
  regions: Region[];
  groupCounts: Record<string, number>;
}) {
  const [regionId, setRegionId] = useState<string>("");
  const [affiliation, setAffiliation] = useState("");
  const [names, setNames] = useState<string[]>([""]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 선수명 칸 포커스 이동 (Enter → 다음 칸)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  useEffect(() => {
    if (focusIndex != null) {
      inputRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, names]);

  // 동명이인 확인 모달
  const [confirm, setConfirm] = useState<{
    colliding: NameMatch[];
    nonColliding: string[];
    allNames: string[];
  } | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  const ridNum = regionId ? Number(regionId) : null;
  const baseCount =
    ridNum && affiliation.trim()
      ? (groupCounts[groupKey(ridNum, affiliation.trim())] ?? 0)
      : 0;

  const filledNames = names.map((n) => n.trim()).filter(Boolean);

  function setName(i: number, v: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  }
  function addNameField() {
    setNames((prev) => [...prev, ""]);
  }
  function removeNameField(i: number) {
    setNames((prev) =>
      prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i),
    );
  }
  function reset() {
    setAffiliation("");
    setNames([""]);
  }

  async function doRegister(entries: Entry[]) {
    const res = await registerPlayers({
      tournamentId,
      regionId: ridNum!,
      affiliationName: affiliation.trim(),
      entries,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "등록되었습니다.");
    reset();
    setConfirm(null);
  }

  function submit() {
    if (!ridNum) {
      setFormError("시/군을 선택해주세요.");
      return;
    }
    if (!affiliation.trim()) {
      setFormError("소속을 입력해주세요.");
      return;
    }
    if (filledNames.length === 0) {
      setFormError("선수명을 1명 이상 입력해주세요.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const matches = await checkPlayerMatches({
        regionId: ridNum,
        affiliationName: affiliation.trim(),
        names: filledNames,
      });
      const colliding = matches.filter((m) => m.candidates.length > 0);
      if (colliding.length === 0) {
        await doRegister(filledNames.map((n) => ({ name: n, playerId: null })));
        return;
      }
      // 같은 이름의 기존 선수가 있으면 사용자에게 확인 — 기본값은 기존 첫 후보
      const init: Record<string, Choice> = {};
      for (const m of colliding) init[m.name] = m.candidates[0].playerId;
      const collidingNames = new Set(colliding.map((m) => m.name));
      setChoices(init);
      setConfirm({
        colliding,
        nonColliding: filledNames.filter((n) => !collidingNames.has(n)),
        allNames: filledNames,
      });
    });
  }

  function confirmRegister() {
    if (!confirm) return;
    const collidingNames = new Set(confirm.colliding.map((m) => m.name));
    const entries: Entry[] = confirm.allNames.map((n) => {
      if (!collidingNames.has(n)) return { name: n, playerId: null };
      const c = choices[n];
      return { name: n, playerId: c === "new" || c === undefined ? null : c };
    });
    startTransition(() => doRegister(entries));
  }

  let positionCounter = baseCount;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="reg-region">시/군</Label>
          <RegionCombobox
            id="reg-region"
            regions={regions}
            value={regionId}
            onChange={setRegionId}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="reg-affiliation">소속</Label>
          <AffiliationCombobox
            id="reg-affiliation"
            regionId={ridNum}
            value={affiliation}
            onChange={setAffiliation}
            placeholder={ridNum ? "소속 입력 (자동완성)" : "시/군 먼저 선택"}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>선수명</Label>
        <div className="grid gap-2">
          {names.map((n, i) => {
            const isFilled = n.trim().length > 0;
            const label = isFilled
              ? teamLabelForPosition(++positionCounter)
              : "";
            return (
              <div key={i} className="flex items-center gap-2">
                <Input
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  value={n}
                  placeholder={`선수 ${i + 1}`}
                  onChange={(e) => setName(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // 마지막 칸이면 새 칸 추가 후 그 칸으로, 아니면 다음 칸으로
                      if (i === names.length - 1) addNameField();
                      setFocusIndex(i + 1);
                    }
                  }}
                />
                <span className="w-12 shrink-0 text-center text-sm text-muted-foreground">
                  {label ? `팀 ${label}` : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeNameField(i)}
                  aria-label="이름 입력칸 삭제"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addNameField}
          className="w-fit gap-1"
        >
          <Plus className="h-4 w-4" />
          이름 추가
        </Button>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending
            ? "처리 중..."
            : filledNames.length > 0
              ? `${filledNames.length}명 등록`
              : "등록"}
        </Button>
        {(affiliation || filledNames.length > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="gap-1 text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" />
            초기화
          </Button>
        )}
      </div>

      {/* 동명이인 확인 모달 */}
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>같은 이름의 선수가 있습니다</DialogTitle>
            <DialogDescription>
              기존 선수와 같은 사람인지, 다른 사람(동명이인)인지 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
            {confirm?.colliding.map((m) => (
              <div key={m.name} className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">{m.name}</p>
                <div className="grid gap-1.5">
                  {m.candidates.map((c) => {
                    const selected = choices[m.name] === c.playerId;
                    return (
                      <button
                        key={c.playerId}
                        type="button"
                        onClick={() =>
                          setChoices((p) => ({ ...p, [m.name]: c.playerId }))
                        }
                        className={cn(
                          "flex items-center justify-between rounded border px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-accent",
                        )}
                      >
                        <span>
                          <span className="font-mono text-xs text-muted-foreground">
                            #{c.playerId}
                          </span>{" "}
                          {c.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {c.gender ? GENDER_LABEL[c.gender] : ""}
                            {c.birthYear ? ` ${c.birthYear}년생` : ""} · 참가{" "}
                            {c.participationCount}회
                          </span>
                        </span>
                        {selected ? (
                          <span className="text-xs text-primary">기존 선수</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      setChoices((p) => ({ ...p, [m.name]: "new" }))
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded border border-dashed px-3 py-2 text-left text-sm transition-colors",
                      choices[m.name] === "new"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <UserPlus className="h-4 w-4" />
                    다른 사람 — 새 선수로 등록
                  </button>
                </div>
              </div>
            ))}

            {confirm && confirm.nonColliding.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                신규 등록: {confirm.nonColliding.join(", ")}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type="button" onClick={confirmRegister} loading={pending}>
              {pending ? "등록 중..." : "확인 후 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
