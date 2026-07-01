"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

import { signIn } from "./actions";

type State = { error?: string } | null;

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await signIn(formData);
  return result ?? null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" loading={pending}>
      {pending ? "로그인 중..." : "로그인"}
    </Button>
  );
}

export function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const [state, formAction] = useActionState<State, FormData>(
    action,
    initialError ? { error: initialError } : null,
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>관리자 로그인</CardTitle>
        <CardDescription>경기도볼링협회 운영자 전용</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="redirect" value={redirectTo} />
          <div className="grid gap-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {state?.error ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
