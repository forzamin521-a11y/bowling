-- ============================================================
-- 0004 공개 페이지 지원: 참가 선수명 뷰 + Realtime 발행
-- ============================================================

-- players 마스터는 anon 비공개(RLS)지만, 공개 랭킹에는 참가 선수의 "이름"만 필요.
-- 보안 정의자(뷰 소유자=postgres) 권한으로 실행되는 일반 뷰로 이름만 노출한다.
create or replace view participant_names as
select tp.id as tournament_player_id, p.name
from tournament_players tp
join players p on p.id = tp.player_id;

grant select on participant_names to anon, authenticated, service_role;

-- Realtime: 마감/랭킹 변경을 공개 페이지가 즉시 반영하도록 발행에 추가 (이미 있으면 건너뜀)
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rankings', 'team_rankings', 'game_states'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
