-- ============================================================
-- 0014 선수를 종별(카테고리) 단위로 구분
-- ============================================================
-- 기존: tournament_players 는 대회(tournament) 단위. 팀라벨(A/B/C)도
--       (대회 + 시군 + 소속) 기준이라 서로 다른 종별 선수가 같은 그룹으로 묶임.
-- 변경: tournament_players 에 tournament_category_id 추가.
--       등록·팀라벨 재계산·명단 조회를 모두 종별 단위로.

-- 1) 컬럼 추가 (우선 nullable 로 넣고 백필)
alter table tournament_players
  add column if not exists tournament_category_id bigint
  references tournament_categories(id) on delete cascade;

-- 2) 백필: 기존 배정(팀 구성원 / 레인 선수 / 조)으로 종별 유추
update tournament_players tp
set tournament_category_id = te.tournament_category_id
from tournament_team_members ttm
join tournament_teams tt on tt.id = ttm.tournament_team_id
join tournament_events te on te.id = tt.tournament_event_id
where ttm.tournament_player_id = tp.id
  and tp.tournament_category_id is null;

update tournament_players tp
set tournament_category_id = te.tournament_category_id
from lane_assignment_players lap
join lane_assignments la on la.id = lap.lane_assignment_id
join tournament_events te on te.id = la.tournament_event_id
where lap.tournament_player_id = tp.id
  and tp.tournament_category_id is null;

update tournament_players tp
set tournament_category_id = te.tournament_category_id
from event_squad_members esm
join tournament_events te on te.id = esm.tournament_event_id
where esm.tournament_player_id = tp.id
  and tp.tournament_category_id is null;

-- 3) 폴백: 대회에 종별이 하나뿐이면 그 종별로
update tournament_players tp
set tournament_category_id = c.id
from tournament_categories c
where tp.tournament_category_id is null
  and c.tournament_id = tp.tournament_id
  and (
    select count(*) from tournament_categories c2
    where c2.tournament_id = tp.tournament_id
  ) = 1;

-- 4) 여전히 미결이면 중단(수동 확인 필요) — 실데이터 보존 안전장치
do $$
declare n int;
begin
  select count(*) into n from tournament_players where tournament_category_id is null;
  if n > 0 then
    raise exception '종별을 유추하지 못한 선수 %명이 있습니다. 수동 백필 후 다시 실행하세요.', n;
  end if;
end $$;

-- 5) NOT NULL 확정
alter table tournament_players
  alter column tournament_category_id set not null;

-- 6) 인덱스: 소속 그룹을 종별 단위로 재구성
drop index if exists idx_tp_affiliation;
create index idx_tp_affiliation
  on tournament_players(tournament_category_id, region_id, affiliation_name, team_label);
create index if not exists idx_tp_category
  on tournament_players(tournament_category_id);

-- 7) 팀라벨 재계산: (대회) → (종별) 단위
--    * 입력 파라미터 이름이 바뀌므로 create or replace 로는 안 되고 drop 후 재생성.
--      (plpgsql 함수 간 호출은 하드 의존성이 아니라 trg_recalc_team_labels 드롭 불필요)
drop function if exists recalc_team_labels(bigint, smallint, text);
create function recalc_team_labels(
  p_tournament_category_id bigint,
  p_region_id smallint,
  p_affiliation_name text
)
returns void
language plpgsql
as $$
begin
  with ordered as (
    select id,
           row_number() over (order by registered_order, id) as rn
    from tournament_players
    where tournament_category_id = p_tournament_category_id
      and region_id = p_region_id
      and affiliation_name = p_affiliation_name
  )
  update tournament_players tp
  set team_label = chr(65 + ((o.rn - 1) / 6)::int),  -- 65='A'
      updated_at = now()
  from ordered o
  where tp.id = o.id
    and tp.team_label is distinct from chr(65 + ((o.rn - 1) / 6)::int);
end;
$$;

-- 8) 트리거 함수: 종별 기준으로 그룹 재계산
--    (재귀 가드가 걸린 after_tp_change 트리거는 0006 그대로 유효 → 재생성 불필요)
create or replace function trg_recalc_team_labels()
returns trigger
language plpgsql
as $$
declare
  v_cat bigint;
  v_rid smallint;
  v_aff text;
begin
  if (tg_op = 'DELETE') then
    v_cat := old.tournament_category_id;
    v_rid := old.region_id;
    v_aff := old.affiliation_name;
  else
    v_cat := new.tournament_category_id;
    v_rid := new.region_id;
    v_aff := new.affiliation_name;
  end if;

  perform recalc_team_labels(v_cat, v_rid, v_aff);

  -- 종별/시군/소속이 바뀌면 이전 그룹도 재계산
  if (tg_op = 'UPDATE' and (
        old.tournament_category_id is distinct from new.tournament_category_id
        or old.region_id <> new.region_id
        or old.affiliation_name <> new.affiliation_name)) then
    perform recalc_team_labels(
      old.tournament_category_id, old.region_id, old.affiliation_name);
  end if;

  return null;
end;
$$;
