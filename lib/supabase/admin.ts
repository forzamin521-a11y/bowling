import { createClient as createSbClient } from "@supabase/supabase-js";

/**
 * service_role 키를 사용하는 서버 전용 Supabase 클라이언트.
 * 반드시 서버 컴포넌트/서버 액션/Route Handler 안에서만 호출할 것.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient must only be used on the server");
  }

  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
