import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { TournamentForm } from "../tournament-form";

export default function NewTournamentPage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          대회 목록
        </Link>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">새 대회</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>대회 기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentForm mode="create" />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        대회 생성 후 다음 화면에서 종별과 세부종목을 등록할 수 있습니다.
      </p>
    </div>
  );
}
