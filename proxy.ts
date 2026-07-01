import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

const ADMIN_LOGIN_PATH = "/admin/login";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === ADMIN_LOGIN_PATH;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 이미 로그인된 상태로 로그인 페이지에 오면 대시보드로
  if (isLoginPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  if (isLoginPage) return response;

  // 미로그인 → 로그인 페이지로
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // 역할 검증
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.searchParams.set("error", "no_permission");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
