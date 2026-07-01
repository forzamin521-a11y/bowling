"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function changePassword(formData: FormData) {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  }
  if (next !== confirm) {
    return { error: "새 비밀번호가 일치하지 않습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "로그인이 필요합니다." };
  }

  const verify = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verify.error) {
    return { error: "현재 비밀번호가 올바르지 않습니다." };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return { error: "비밀번호 변경에 실패했습니다." };
  }

  return { success: "비밀번호가 변경되었습니다." };
}
