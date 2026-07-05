import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("✗ env not loaded:", { url: !!url, key: !!key });
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) regions
const regions = await sb.from("regions").select("id, name").order("sort_order");
if (regions.error) {
  console.error("✗ regions:", regions.error.message);
  process.exit(1);
}
console.log(
  `✓ regions: ${regions.data.length}개 (${regions.data
    .slice(0, 5)
    .map((r) => r.name)
    .join(", ")} ...)`,
);

// 2) profiles
const profiles = await sb.from("profiles").select("email, role");
if (profiles.error) {
  console.error("✗ profiles:", profiles.error.message);
  process.exit(1);
}
console.log(`✓ profiles: ${profiles.data.length}개`);
profiles.data.forEach((p) => console.log(`  - ${p.email} (${p.role})`));

// 3) enum 확인 (event_type)
const events = await sb.from("tournament_events").select("event_type").limit(1);
if (events.error && !events.error.message.includes("0 rows")) {
  console.error("✗ tournament_events:", events.error.message);
  process.exit(1);
}
console.log("✓ tournament_events 테이블 존재");

console.log("\n✓ Supabase 연결 정상");
