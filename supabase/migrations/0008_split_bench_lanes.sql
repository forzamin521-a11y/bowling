-- ============================================================
-- 0008 5인조 벤치 선수 별도 레인 배치 지원
-- ============================================================
-- lane_assignment_players 에 half 차원을 추가한다.
--   half = 0 : 전 게임 적용 (기본). 레인이 바뀌지 않는 모든 선수.
--   half = 2 : 후반 오버라이드. 후반(게임 > halftime_split_at) 레인이
--              전반과 다른 선수(후반 교체로 레인 스왑된 선수)만 추가 행으로 가진다.
-- 멱등적으로 재실행 가능.

alter table lane_assignment_players
  add column if not exists half smallint not null default 0;

-- 0(전 게임) 또는 2(후반 오버라이드)만 허용
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lane_assignment_players_half_check'
  ) then
    alter table lane_assignment_players
      add constraint lane_assignment_players_half_check
      check (half in (0, 2));
  end if;
end $$;

-- 기존 unique(lane_assignment_id, tournament_player_id) → half 포함으로 교체.
-- 제약명은 Postgres 자동생성(잘림 가능)이라 컬럼 조합으로 동적 탐색해 드롭한다.
do $$
declare
  v_con text;
begin
  select c.conname into v_con
  from pg_constraint c
  where c.conrelid = 'lane_assignment_players'::regclass
    and c.contype = 'u'
    and c.conkey = array(
      select attnum from pg_attribute
      where attrelid = 'lane_assignment_players'::regclass
        and attname in ('lane_assignment_id', 'tournament_player_id')
      order by attnum
    );
  if v_con is not null then
    execute format('alter table lane_assignment_players drop constraint %I', v_con);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lane_assignment_players_la_player_half_key'
  ) then
    alter table lane_assignment_players
      add constraint lane_assignment_players_la_player_half_key
      unique (lane_assignment_id, tournament_player_id, half);
  end if;
end $$;
