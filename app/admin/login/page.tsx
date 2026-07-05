import { Trophy } from "lucide-react";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-primary/[0.06] to-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="bg-brand-gradient flex h-12 w-12 items-center justify-center rounded-xl text-primary-foreground shadow-md shadow-primary/20">
            <Trophy className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-medium tracking-wide text-muted-foreground">
            경기도볼링협회
          </p>
        </div>
        <LoginForm
          redirectTo={params.redirect ?? "/admin"}
          initialError={
            params.error === "no_permission"
              ? "관리자 권한이 없는 계정입니다."
              : undefined
          }
        />
      </div>
    </div>
  );
}
