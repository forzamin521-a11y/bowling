import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/sidebar";
import { ConfirmProvider } from "@/components/confirm-provider";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // 미들웨어(proxy.ts)가 이미 getUser로 인증·권한을 검증했으므로
  // 여기서는 이메일 표시용으로 쿠키 세션만 읽는다(네트워크 왕복 없음).
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/admin/login");
  const user = session.user;

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md"
      >
        본문으로 건너뛰기
      </a>
      <AdminSidebar userEmail={user.email ?? ""} />
      <div className="flex-1 overflow-auto bg-muted/20">
        <main id="main-content" className="p-4 sm:p-6">
          <ConfirmProvider>{children}</ConfirmProvider>
        </main>
      </div>
    </div>
  );
}
