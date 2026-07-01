"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { RegionCombobox } from "@/components/admin/region-combobox";

import { deletePlayer, updatePlayer } from "./actions";
import { AffiliationCombobox } from "./affiliation-combobox";

export type RegisteredPlayer = {
  id: number;
  masterPlayerId: number;
  playerNumber: number;
  teamLabel: string;
  regionId: number;
  regionName: string;
  affiliationName: string;
  name: string;
};

type Region = { id: number; name: string };

export function PlayersTable({
  tournamentId,
  players,
  regions,
}: {
  tournamentId: number;
  players: RegisteredPlayer[];
  regions: Region[];
}) {
  const [regionFilter, setRegionFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return players.filter((p) => {
      if (regionFilter !== "all" && String(p.regionId) !== regionFilter)
        return false;
      if (!term) return true;
      return `${p.affiliationName} ${p.name}`.toLowerCase().includes(term);
    });
  }, [players, regionFilter, q]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <RegionCombobox
          regions={regions}
          value={regionFilter}
          onChange={setRegionFilter}
          allLabel="전체 시/군"
          className="w-40"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="소속 / 이름 검색"
          className="max-w-xs"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} / {players.length}명
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">번호</TableHead>
              <TableHead>시/군</TableHead>
              <TableHead>소속</TableHead>
              <TableHead className="w-14">팀</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="w-24 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {players.length === 0
                    ? "아직 등록된 선수가 없습니다."
                    : "검색 결과가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) =>
                editingId === p.id ? (
                  <EditRow
                    key={p.id}
                    tournamentId={tournamentId}
                    player={p}
                    regions={regions}
                    onClose={() => setEditingId(null)}
                  />
                ) : (
                  <ViewRow
                    key={p.id}
                    tournamentId={tournamentId}
                    player={p}
                    onEdit={() => setEditingId(p.id)}
                  />
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ViewRow({
  tournamentId,
  player,
  onEdit,
}: {
  tournamentId: number;
  player: RegisteredPlayer;
  onEdit: () => void;
}) {
  const onDelete = async () => {
    const r = await deletePlayer(tournamentId, player.id);
    if (r?.error) toast.error(r.error);
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-muted-foreground">
        {player.playerNumber}
      </TableCell>
      <TableCell>{player.regionName}</TableCell>
      <TableCell>{player.affiliationName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{player.teamLabel}</Badge>
      </TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/admin/players/${player.masterPlayerId}`}
          className="hover:underline"
        >
          {player.name}
        </Link>
        <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
          #{player.masterPlayerId}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label="수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            title="선수를 삭제할까요?"
            description={
              <>
                <b>{player.name}</b> 선수를 이 대회에서 삭제합니다. 등록된 점수가
                있다면 함께 삭제될 수 있습니다.
              </>
            }
            confirmLabel="삭제"
            onConfirm={onDelete}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditRow({
  tournamentId,
  player,
  regions,
  onClose,
}: {
  tournamentId: number;
  player: RegisteredPlayer;
  regions: Region[];
  onClose: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [regionId, setRegionId] = useState(String(player.regionId));
  const [affiliation, setAffiliation] = useState(player.affiliationName);
  const [pending, startTransition] = useTransition();

  function save() {
    const rid = Number(regionId);
    if (!rid || !affiliation.trim() || !name.trim()) {
      toast.error("시/군 · 소속 · 이름을 모두 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const r = await updatePlayer({
        tournamentId,
        tournamentPlayerId: player.id,
        name: name.trim(),
        regionId: rid,
        affiliationName: affiliation.trim(),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={6} className="p-3">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">번호 {player.playerNumber}</span>
            <Badge variant="outline">{player.teamLabel}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">시/군</span>
              <RegionCombobox
                regions={regions}
                value={regionId}
                onChange={setRegionId}
                className="h-9"
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">소속</span>
              <AffiliationCombobox
                regionId={Number(regionId)}
                value={affiliation}
                onChange={setAffiliation}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">이름</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                  }
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="gap-1"
            >
              <Check className="h-4 w-4" />
              저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={pending}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              취소
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
