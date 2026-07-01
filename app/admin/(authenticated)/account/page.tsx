import { createClient } from "@/lib/supabase/server";

import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">계정</h2>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <PasswordForm />
    </div>
  );
}
