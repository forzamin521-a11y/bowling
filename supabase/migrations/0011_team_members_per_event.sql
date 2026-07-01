-- ============================================================
-- 0011 팀 멤버십을 세부종목(이벤트) 단위로 — 전역 unique 제거
-- ============================================================
-- 문제: tournament_team_members 에 unique(tournament_player_id) 전역 제약이 있어
--       한 선수가 "대회 전체"에서 단 하나의 팀에만 속할 수 있었다. 그래서 5인조 팀에
--       편성된 선수를 3인조/2인조 팀에 넣을 수 없었다(같은 선수가 여러 세부종목 팀에
--       동시에 속해야 정상).
-- 수정: 멤버 행에 tournament_event_id 를 두고(트리거로 팀에서 자동 채움),
--       전역 unique 를 (이벤트, 선수) 단위 unique 로 교체.
-- 멱등 재실행 가능.

-- 1) 이벤트 컬럼 추가
alter table tournament_team_members
  add column if not exists tournament_event_id bigint
    references tournament_events(id) on delete cascade;

-- 2) 팀에서 이벤트를 자동으로 채우는 트리거 (모든 삽입 경로에서 안전)
create or replace function set_ttm_event_id()
returns trigger
language plpgsql
as $$
begin
  if new.tournament_event_id is null then
    select tt.tournament_event_id into new.tournament_event_id
    from tournament_teams tt
    where tt.id = new.tournament_team_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_ttm_event_id on tournament_team_members;
create trigger trg_set_ttm_event_id
  before insert on tournament_team_members
  for each row execute function set_ttm_event_id();

-- 3) 기존 행 백필
update tournament_team_members ttm
set tournament_event_id = tt.tournament_event_id
from tournament_teams tt
where tt.id = ttm.tournament_team_id
  and ttm.tournament_event_id is null;

alter table tournament_team_members
  alter column tournament_event_id set not null;

-- 4) 전역 unique(tournament_player_id) 제거 (컬럼 조합으로 동적 탐색해 드롭)
do $$
declare
  v_con text;
begin
  select c.conname into v_con
  from pg_constraint c
  where c.conrelid = 'tournament_team_members'::regclass
    and c.contype = 'u'
    and c.conkey = array(
      select a.attnum
      from pg_attribute a
      where a.attrelid = 'tournament_team_members'::regclass
        and a.attname = 'tournament_player_id'
    );
  if v_con is not null then
    execute format(
      'alter table tournament_team_members drop constraint %I', v_con
    );
  end if;
end $$;

-- 5) (이벤트, 선수) 단위 unique — 한 선수는 한 세부종목에서 한 팀만
create unique index if not exists ux_ttm_event_player
  on tournament_team_members(tournament_event_id, tournament_player_id);

create index if not exists idx_ttm_event
  on tournament_team_members(tournament_event_id);
