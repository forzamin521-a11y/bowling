"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * 랭킹 실시간 갱신.
 * - 기본: 30초 폴링 (Realtime 미설정 환경에서도 동작 보장)
 * - Realtime: 발행(supabase_realtime)에 추가돼 있으면 마감/랭킹 변경 시 즉시 갱신
 */
export function useRankingsRealtime(eventId: number) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);

    const supabase = createClient();
    const channel = supabase
      .channel(`rankings-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rankings",
          filter: `tournament_event_id=eq.${eventId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `tournament_event_id=eq.${eventId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [eventId, router]);
}
