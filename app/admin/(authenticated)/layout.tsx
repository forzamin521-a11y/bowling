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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

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
