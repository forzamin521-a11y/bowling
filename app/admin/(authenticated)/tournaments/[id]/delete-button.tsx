"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";

import { deleteTournament } from "../actions";

export function DeleteTournamentButton({
  tournamentId,
  tournamentName,
}: {
  tournamentId: number;
  tournamentName: string;
}) {
  const onConfirm = async () => {
    const result = await deleteTournament(tournamentId);
    if (result?.error) toast.error(result.error);
  };

  return (
    <ConfirmDialog
      title="대회를 삭제할까요?"
      description={
        <>
          <b>{tournamentName}</b> 대회를 삭제하면 관련된 선수·점수·랭킹이 모두
          함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </>
      }
      confirmLabel="삭제"
      onConfirm={onConfirm}
      trigger={
        <Button variant="destructive" size="sm" className="gap-1">
          <Trash2 className="h-4 w-4" />
          대회 삭제
        </Button>
      }
    />
  );
}
