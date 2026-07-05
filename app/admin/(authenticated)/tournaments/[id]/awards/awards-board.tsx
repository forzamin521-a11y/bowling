"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Award, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import type {
  AwardCategoryGroup,
  AwardEntry,
  AwardRecipient,
} from "@/lib/domain/awards";

const DEFAULT_PHRASE =
  "위 선수는 본 협회가 개최한 {대회명} {종별} {종목} 경기에서 위와 같은 성적을 거두었으므로 이에 상장을 수여합니다.";

/** 실제 인쇄되는 상장 한 장 (팀원 개별 모드면 팀 상장이 인원수만큼 확장됨). */
type Cert = {
  id: string;
  number: string | null;
  entry: AwardEntry;
  /** 팀원 개별 상장 모드에서의 단일 수상자. null이면 entry.recipients 전원. */
  soloRecipient: AwardRecipient | null;
};

function fmtKoreanDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function AwardsBoard({
  tournamentName,
  venue,
  endDate,
  groups,
}: {
  tournamentName: string;
  venue: string;
  endDate: string;
  groups: AwardCategoryGroup[];
}) {
  const allEntries = useMemo(
    () => groups.flatMap((g) => g.events.flatMap((e) => e.entries)),
    [groups],
  );

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        allEntries
          .filter((e) => e.finished && e.rank <= 3)
          .map((e) => e.key),
      ),
  );
  const [phrase, setPhrase] = useState(DEFAULT_PHRASE);
  const [issuerTitle, setIssuerTitle] = useState("경기도볼링협회장");
  const [issuerName, setIssuerName] = useState("");
  const [awardDate, setAwardDate] = useState(() => fmtKoreanDate(endDate));
  const [showNumber, setShowNumber] = useState(true);
  const [numberPrefix, setNumberPrefix] = useState(
    () => `제 ${new Date(endDate).getFullYear() || new Date().getFullYear()}-`,
  );
  const [numberStart, setNumberStart] = useState(1);
  const [showRecord, setShowRecord] = useState(true);
  const [perMember, setPerMember] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggle = (key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectUpToRank = (maxRank: number) => {
    setSelected(
      new Set(allEntries.filter((e) => e.rank <= maxRank).map((e) => e.key)),
    );
  };

  // 선택 항목 → 인쇄될 상장 목록 (그룹 순서 유지, 일련번호 부여)
  const certs: Cert[] = useMemo(() => {
    const out: Cert[] = [];
    let seq = numberStart;
    const nextNumber = () =>
      showNumber ? `${numberPrefix}${seq++} 호` : null;
    for (const g of groups) {
      for (const ev of g.events) {
        for (const entry of ev.entries) {
          if (!selected.has(entry.key)) continue;
          if (perMember && entry.isTeam) {
            for (const r of entry.recipients) {
              out.push({
                id: `${entry.key}:${r.playerNumber}`,
                number: nextNumber(),
                entry,
                soloRecipient: r,
              });
            }
          } else {
            out.push({
              id: entry.key,
              number: nextNumber(),
              entry,
              soloRecipient: null,
            });
          }
        }
      }
    }
    return out;
  }, [groups, selected, perMember, showNumber, numberPrefix, numberStart]);

  if (allEntries.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="상장을 만들 순위 데이터가 없습니다"
        description="게임을 마감하면 순위가 확정되고 상장 대상이 표시됩니다."
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ---------- 설정 (인쇄 시 숨김) ---------- */}
      <div className="grid content-start gap-4 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle>출력 대상</CardTitle>
            <CardDescription>
              상장을 출력할 수상 내역을 선택하세요. 진행중 종목은 순위가 바뀔
              수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">빠른 선택:</span>
              {[1, 2, 3, 4].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => selectUpToRank(n)}
                >
                  1~{n}위
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                해제
              </Button>
            </div>

            <div className="grid max-h-[480px] gap-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.categoryId} className="grid gap-2">
                  <p className="text-sm font-semibold">{g.categoryLabel}</p>
                  {g.events.map((ev) => (
                    <div
                      key={`${g.categoryId}:${ev.eventKind}`}
                      className="grid gap-1 rounded-md border p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {ev.eventLabel}
                        </span>
                        {!ev.finished && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-400"
                          >
                            진행중
                          </Badge>
                        )}
                      </div>
                      {ev.entries.map((entry) => (
                        <label
                          key={entry.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={selected.has(entry.key)}
                            onCheckedChange={(on) =>
                              toggle(entry.key, on === true)
                            }
                          />
                          <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                            {entry.rank}위
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {entry.isTeam
                              ? entry.teamName
                              : `${entry.affiliationName} ${entry.recipients[0]?.name ?? ""}`}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {entry.total.toLocaleString()}점
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>상장 설정</CardTitle>
            <CardDescription>
              문구의 {"{대회명} {종별} {종목} {순위}"}는 자동 치환됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="award-phrase">본문 문구</Label>
              <Textarea
                id="award-phrase"
                rows={4}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="award-issuer-title">수여자 직함</Label>
                <Input
                  id="award-issuer-title"
                  value={issuerTitle}
                  onChange={(e) => setIssuerTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="award-issuer-name">수여자 성명 (선택)</Label>
                <Input
                  id="award-issuer-name"
                  value={issuerName}
                  placeholder="예: 홍길동"
                  onChange={(e) => setIssuerName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="award-date">수여일</Label>
              <Input
                id="award-date"
                value={awardDate}
                onChange={(e) => setAwardDate(e.target.value)}
              />
            </div>

            <Separator />

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showNumber}
                onCheckedChange={(on) => setShowNumber(on === true)}
              />
              상장 번호 표시
            </label>
            {showNumber && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="award-number-prefix">번호 접두</Label>
                  <Input
                    id="award-number-prefix"
                    value={numberPrefix}
                    onChange={(e) => setNumberPrefix(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="award-number-start">시작 번호</Label>
                  <Input
                    id="award-number-start"
                    type="number"
                    min={1}
                    value={numberStart}
                    onChange={(e) =>
                      setNumberStart(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={showRecord}
                onCheckedChange={(on) => setShowRecord(on === true)}
              />
              기록(총점) 표시
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={perMember}
                onCheckedChange={(on) => setPerMember(on === true)}
              />
              팀 종목은 팀원마다 개별 상장 출력
            </label>
          </CardContent>
        </Card>

        <Button
          type="button"
          size="lg"
          className="gap-2"
          disabled={certs.length === 0}
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
          상장 {certs.length}장 인쇄 (A4)
        </Button>
        <p className="text-xs text-muted-foreground">
          인쇄 대화상자에서 여백을 “없음”, 배경 그래픽을 “켬”으로 설정하면
          테두리까지 온전히 인쇄됩니다. PDF로 저장도 가능합니다.
        </p>
      </div>

      {/* ---------- 미리보기 ---------- */}
      <div className="min-w-0 print:hidden">
        <p className="mb-2 text-sm text-muted-foreground">
          미리보기 — {certs.length}장
        </p>
        <div className="grid max-h-[80vh] justify-items-center gap-6 overflow-auto rounded-lg border bg-muted/40 p-4">
          {certs.length === 0 ? (
            <p className="py-16 text-sm text-muted-foreground">
              왼쪽에서 출력할 수상 내역을 선택하세요.
            </p>
          ) : (
            certs.map((cert) => (
              <div key={cert.id} className="shadow-lg">
                <Certificate
                  cert={cert}
                  tournamentName={tournamentName}
                  venue={venue}
                  phrase={phrase}
                  awardDate={awardDate}
                  issuerTitle={issuerTitle}
                  issuerName={issuerName}
                  showRecord={showRecord}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---------- 인쇄 전용 포털 (화면에는 숨김) ---------- */}
      {mounted &&
        certs.length > 0 &&
        createPortal(
          <div className="award-print-root">
            {certs.map((cert) => (
              <div key={cert.id} className="a4-cert">
                <Certificate
                  cert={cert}
                  tournamentName={tournamentName}
                  venue={venue}
                  phrase={phrase}
                  awardDate={awardDate}
                  issuerTitle={issuerTitle}
                  issuerName={issuerName}
                  showRecord={showRecord}
                />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** A4 상장 한 장. 화면 미리보기와 인쇄에 동일하게 쓰인다. */
function Certificate({
  cert,
  tournamentName,
  venue,
  phrase,
  awardDate,
  issuerTitle,
  issuerName,
  showRecord,
}: {
  cert: Cert;
  tournamentName: string;
  venue: string;
  phrase: string;
  awardDate: string;
  issuerTitle: string;
  issuerName: string;
  showRecord: boolean;
}) {
  const { entry, soloRecipient, number } = cert;
  const recipients = soloRecipient ? [soloRecipient] : entry.recipients;
  const names = recipients.map((r) => r.name);

  const body = phrase
    .replaceAll("{대회명}", tournamentName)
    .replaceAll("{종별}", entry.categoryLabel)
    .replaceAll("{종목}", entry.eventLabel)
    .replaceAll("{순위}", `${entry.rank}위`)
    .replaceAll("{장소}", venue);

  const record =
    entry.isTeam && !soloRecipient
      ? `팀 합계 ${entry.total.toLocaleString()}점`
      : entry.gamesPlayed
        ? `총점 ${entry.total.toLocaleString()}점 (${entry.gamesPlayed}게임)`
        : `총점 ${entry.total.toLocaleString()}점`;

  // 인원이 많은 팀 상장은 이름 글자 크기를 줄인다.
  const nameSize =
    names.length >= 5 ? "22pt" : names.length >= 3 ? "26pt" : "32pt";

  return (
    <div className="cert-sheet">
      {/* 이중 테두리 액자 */}
      <div className="cert-frame">
        <div className="cert-inner">
          <div className="cert-number">{number ?? " "}</div>

          <h1 className="cert-title">상 장</h1>

          <p className="cert-event">
            {entry.categoryLabel} {entry.eventLabel}
          </p>
          <p className="cert-rank">제 {entry.rank} 위</p>

          <div className="cert-recipient">
            <p className="cert-affiliation">
              {entry.regionName} · {entry.affiliationName}
              {entry.isTeam && entry.teamName
                ? ` (${entry.teamName.replace(entry.affiliationName, "").trim()}팀)`
                : ""}
            </p>
            <p className="cert-names" style={{ fontSize: nameSize }}>
              {names.join("　")}
            </p>
            {showRecord && <p className="cert-record">{record}</p>}
          </div>

          <p className="cert-body">{body}</p>

          <p className="cert-date">{awardDate}</p>

          <p className="cert-issuer">
            {issuerTitle}
            {issuerName ? `　${issuerName}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
