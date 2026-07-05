// 5인조 팀에 누락된 소속 멤버(6번째)를 벤치로 일괄 추가한다.
// - 같은 (시군+소속+팀라벨) 등록선수 중 팀에 빠진 선수를 최대 6명까지 채움
// - 추가 멤버는 event_lineups 전 게임 role=bench 로 생성 (후반 교체는 UI에서)
// - 멱등: 이미 6명이거나 채울 멤버가 없으면 건너뜀
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("✗ env not loaded:", { url: !!url, key: !!key });
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX = 6;

// team5 세부종목 전체
const { data: events, error: evErr } = await sb
  .from("tournament_events")
  .select("id, games_count, tournament_categories(tournament_id)")
  .eq("event_type", "team5");
if (evErr) {
  console.error("✗ events:", evErr.message);
  process.exit(1);
}

let addedTotal = 0;
for (const ev of events ?? []) {
  const tid = ev.tournament_categories.tournament_id;
  const gamesCount = ev.games_count;

  // 등록선수 (그룹 매핑용)
  const { data: tps } = await sb
    .from("tournament_players")
    .select("id, player_number, region_id, affiliation_name, team_label")
    .eq("tournament_id", tid);
  const groupOf = new Map();
  for (const p of tps ?? []) {
    const k = `${p.region_id}|${p.affiliation_name}|${p.team_label}`;
    if (!groupOf.has(k)) groupOf.set(k, []);
    groupOf.get(k).push(p);
  }

  const { data: teams } = await sb
    .from("tournament_teams")
    .select("id, region_id, affiliation_name, team_label")
    .eq("tournament_event_id", ev.id);

  for (const t of teams ?? []) {
    const { data: mem } = await sb
      .from("tournament_team_members")
      .select("tournament_player_id, member_order")
      .eq("tournament_team_id", t.id);
    const memIds = new Set((mem ?? []).map((m) => m.tournament_player_id));
    let maxOrder = Math.max(0, ...(mem ?? []).map((m) => m.member_order));
    if (memIds.size >= MAX) continue;

    const k = `${t.region_id}|${t.affiliation_name}|${t.team_label}`;
    const group = (groupOf.get(k) ?? [])
      .slice()
      .sort((a, b) => a.player_number - b.player_number);
    const missing = group.filter((p) => !memIds.has(p.id));
    const slots = MAX - memIds.size;
    const toAdd = missing.slice(0, slots);
    if (toAdd.length === 0) continue;

    for (const p of toAdd) {
      maxOrder += 1;
      const { error: mErr } = await sb
        .from("tournament_team_members")
        .insert({
          tournament_team_id: t.id,
          tournament_player_id: p.id,
          member_order: maxOrder,
        });
      if (mErr) {
        console.error(`✗ team ${t.id} member ${p.player_number}:`, mErr.message);
        continue;
      }
      const lineupRows = [];
      for (let g = 1; g <= gamesCount; g++) {
        lineupRows.push({
          tournament_team_id: t.id,
          game_number: g,
          tournament_player_id: p.id,
          role: "bench",
        });
      }
      const { error: lErr } = await sb
        .from("event_lineups")
        .insert(lineupRows);
      if (lErr) {
        console.error(`✗ team ${t.id} lineup ${p.player_number}:`, lErr.message);
        continue;
      }
      addedTotal += 1;
      console.log(
        `✓ event ${ev.id} · team ${t.id} [${t.affiliation_name} ${t.team_label}] ← 벤치 추가: ${p.player_number}번`,
      );
    }
  }
}

console.log(`\n완료: 총 ${addedTotal}명 벤치 추가`);
process.exit(0);
