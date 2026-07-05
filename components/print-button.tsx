"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** 현재 화면을 브라우저 인쇄(A4)로 내보내는 버튼. 인쇄물에서는 숨겨진다. */
export function PrintButton({ label = "인쇄" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="gap-1.5 print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
