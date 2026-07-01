"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * 작업 흐름 도중(저장 핸들러 내부 등) 조건부로 호출하는 명령형 확인 다이얼로그.
 * `const confirm = useConfirm(); if (await confirm({...})) { ... }`
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((next) => {
    setOpts(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={opts !== null}
        onOpenChange={(open) => {
          // 바깥 클릭 / ESC / 취소 → 거부로 처리
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description ? (
              <AlertDialogDescription>
                {opts.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{opts?.cancelLabel ?? "취소"}</AlertDialogCancel>
            <AlertDialogAction
              variant={opts?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
