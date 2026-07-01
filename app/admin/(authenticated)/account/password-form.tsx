"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changePassword } from "@/app/admin/actions";

type State = { error?: string; success?: string } | null;

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await changePassword(formData);
  return result ?? null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "변경 중..." : "비밀번호 변경"}
    </Button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<State, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 변경</CardTitle>
        <CardDescription>8자 이상 사용해주세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="grid max-w-sm gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current">현재 비밀번호</Label>
            <Input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="next">새 비밀번호</Label>
            <Input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">새 비밀번호 확인</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
