import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "./env";

/**
 * 공개(비인증) 데이터 전용 Supabase 클라이언트.
 *
 * 쿠키를 읽지 않으므로 이 클라이언트만 쓰는 서버 컴포넌트는 `cookies()`에
 * 의해 강제 dynamic이 되지 않는다 → `export const revalidate`로 ISR 캐싱이
 * 가능해져 서울 CDN 엣지에서 즉시 서빙된다.
 *
 * 공개 대회 결과는 anon 권한(RLS)으로 읽으므로 세션이 필요 없다.
 */
export function createPublicClient() {
  const { url, anonKey } = getPublicSupabaseEnv();

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
