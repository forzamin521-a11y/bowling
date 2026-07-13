import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "@/lib/supabase/env";

const ADMIN_LOGIN_PATH = "/admin/login";

function getSupabaseOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) return null;

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return null;
  }
}

function buildContentSecurityPolicy(nonce: string) {
  const connectSources = ["'self'"];
  const supabaseOrigin = getSupabaseOrigin();

  // If this environment variable is missing or malformed, Supabase requests are blocked
  // by CSP instead of silently broadening the allowlist. Fix the deployment env in that case.
  if (supabaseOrigin) {
    connectSources.push(supabaseOrigin);

    if (supabaseOrigin.startsWith("https://")) {
      connectSources.push(supabaseOrigin.replace("https://", "wss://"));
    }
  }

  if (process.env.NODE_ENV === "development") {
    connectSources.push("ws://localhost:3000");
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Existing React style props render as style attributes; removing this can break charts and drag states.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()",
  );

  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next.js uses this request header to add the nonce to its own inline scripts.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = applySecurityHeaders(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    csp,
  );

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  // Security headers apply to public pages and static responses too; auth work is admin-only.
  if (!isAdminRoute) return response;

  const { url, anonKey } = getPublicSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
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
  });
  const isLoginPage = pathname === ADMIN_LOGIN_PATH;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 이미 로그인된 상태로 로그인 페이지에 오면 대시보드로
  if (isLoginPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.searchParams.delete("redirect");
    return applySecurityHeaders(NextResponse.redirect(url), csp);
  }

  if (isLoginPage) return response;

  // 미로그인 → 로그인 페이지로
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.searchParams.set("redirect", pathname);
    return applySecurityHeaders(NextResponse.redirect(url), csp);
  }

  // 역할 검증: JWT(app_metadata.role)에서 우선 읽어 DB 조회를 생략한다.
  // 아직 역할이 심기지 않은 구 토큰은 profiles 조회로 폴백(마이그레이션 과도기 호환).
  let role = (user.app_metadata as { role?: string } | null)?.role;
  if (!role) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role;
  }

  if (!role || !["admin", "super_admin"].includes(role)) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN_PATH;
    url.searchParams.set("error", "no_permission");
    return applySecurityHeaders(NextResponse.redirect(url), csp);
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
