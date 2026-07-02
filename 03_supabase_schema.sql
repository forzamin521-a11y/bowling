-- =============================================================================
-- 경기도볼링협회 SaaS — Supabase Schema
-- =============================================================================
-- 적용 순서:
--   1) 본 파일을 Supabase SQL Editor에 통째로 붙여 실행 (또는 supabase db push)
--   2) 마지막 "## SEED" 섹션 직전에 관리자 계정을 Supabase Dashboard
--      Auth > Users 에서 admin@bowling.com / admin123 으로 생성
--   3) SEED 섹션 실행 (시드 계정 profile 생성 + 시/군 마스터)
--
-- 주의:
--   - 모든 테이블에 RLS 활성화. 정책 미부여 시 anon/authenticated 접근 불가.
--   - service_role 키는 RLS 우회. 서버 액션에서만 사용할 것.
-- =============================================================================


-- ============================================================
-- ## EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;       -- 자동완성 부분일치 인덱스용


-- ============================================================
-- ## ENUMS
-- ============================================================
create type user_role as enum ('admin', 'super_admin');

create type tournament_status_override as enum ('upcoming', 'ongoing', 'finished');
-- NULL이면 자동(기간 기반), 값이 있으면 강제

create type category_age as enum
  ('ELEM_U10', 'ELEM_U12', 'MIDDLE', 'HIGH', 'COLLEGE', 'ADULT');

create type gender as enum ('M', 'F');

create type event_type as enum ('single', 'double', 'triple', 'team5');

create type lane_move_direction as enum ('L', 'R');

create type game_status as enum ('open', 'locked');

create type lineup_role as enum ('starter', 'bench');
-- 5인조 6명 로스터 중 starter=출전, bench=대기 (게임별로 다를 수 있음)


-- ============================================================
-- ## PROFILES (Supabase Auth 확장)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role user_role not null default 'admin',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role);

-- 자동 프로필 생성 트리거
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ============================================================
-- ## 시/군 마스터
-- ============================================================
create table regions (
  id smallserial primary key,
  name text not null unique,
  sort_order smallint not null default 0
);

create index idx_regions_sort on regions(sort_order, name);


-- ============================================================
-- ## 소속 마스터 (자동완성용 캐시)
-- ============================================================
create table affiliations (
  id bigserial primary key,
  region_id smallint not null references regions(id),
  name text not null,
  use_count int not null default 0,           -- 등록될 때마다 +1, 자동완성 정렬
  created_at timestamptz not null default now(),
  unique (region_id, name)
);

create index idx_affiliations_region on affiliations(region_id);
create index idx_affiliations_name_trgm on affiliations using gin (name gin_trgm_ops);


-- ============================================================
-- ## 마스터 선수
-- ============================================================
create table players (
  id bigserial primary key,
  name text not null,
  region_id smallint not null references regions(id),
  affiliation_id bigint references affiliations(id),
  affiliation_name text not null,             -- 정규화 안 된 원본(이력 보존)
  birth_year smallint,
  gender gender,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_players_search on players(name, region_id, affiliation_id);
create index idx_players_name_trgm on players using gin (name gin_trgm_ops);


-- ============================================================
-- ## 대회
-- ============================================================
create table tournaments (
  id bigserial primary key,
  name text not null,
  venue text not null,
  start_date date not null,
  end_date date not null,
  status_override tournament_status_override,  -- NULL이면 기간 기반 자동
  settings jsonb not null default '{}'::jsonb, -- tiebreaker_rule, max_per_lane 등
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_tournaments_period on tournaments(start_date, end_date);


-- 상태 산정 뷰
create or replace view tournaments_with_status as
select
  t.*,
  coalesce(
    t.status_override::text,
    case
      when current_date < t.start_date then 'upcoming'
      when current_date > t.end_date   then 'finished'
      else 'ongoing'
    end
  ) as status
from tournaments t;


-- ============================================================
-- ## 대회 종별 (예: 고등부 남자)
-- ============================================================
create table tournament_categories (
  id bigserial primary key,
  tournament_id bigint not null references tournaments(id) on delete cascade,
  age category_age not null,
  gender gender not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, age, gender)
);


-- ============================================================
-- ## 세부종목 (예: 고등부 남자 2인조, 6게임)
-- ============================================================
create table tournament_events (
  id bigserial primary key,
  tournament_category_id bigint not null references tournament_categories(id) on delete cascade,
  event_type event_type not null,
  games_count smallint not null default 6,    -- 개인전/2/3인조: 기본 6, 5인조: 1~6 관리자 선택
  halftime_split_at smallint,                 -- 5인조 전반전 끝 게임 번호 (관리자 직접 지정)
                                              --   1 <= halftime_split_at <= games_count
                                              --   값 == games_count 이면 후반전 없음(교체 비활성)
  lane_move_direction lane_move_direction not null default 'R',  -- 세부종목별 레인 이동 방향
  lane_move_offset    smallint            not null default 0,    -- 세부종목별 레인 이동 칸 수(0=이동 없음)
  lane_start smallint,                                            -- 사용 레인 시작 (세부종목 단위)
  lane_end   smallint,                                            -- 사용 레인 끝
  squad_count smallint not null default 1,                        -- 조(squad) 수. 1=분반 없음(기존 동작)
  created_at timestamptz not null default now(),
  unique (tournament_category_id, event_type),
  check (games_count between 1 and 12),
  check (event_type <> 'team5' or games_count between 1 and 6),
  check (halftime_split_at is null or (halftime_split_at >= 1 and halftime_split_at <= games_count)),
  check (squad_count between 1 and 8),
  check (lane_move_offset >= 0),
  check (
    (lane_start is null and lane_end is null)
    or (lane_start is not null and lane_end is not null
        and lane_start >= 1 and lane_end >= lane_start)
  )
);


-- ============================================================
-- ## 대회 참가 선수 (스냅샷 + 대회 내 번호/팀라벨)
-- ============================================================
create table tournament_players (
  id bigserial primary key,
  tournament_id bigint not null references tournaments(id) on delete cascade,
  tournament_category_id bigint not null references tournament_categories(id) on delete cascade,  -- 종별
  player_id bigint not null references players(id),
  region_id smallint not null references regions(id),         -- 스냅샷
  affiliation_name text not null,                              -- 스냅샷
  player_number int not null,                                  -- 대회 내 고유 1부터
  team_label text not null,                                    -- 'A','B','C'... (종별+시군+소속 6명 단위)
  registered_order int not null,                               -- 등록 순서 (라벨 재계산용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_number),
  unique (tournament_id, player_id)
);

create index idx_tp_tournament on tournament_players(tournament_id);
create index idx_tp_category on tournament_players(tournament_category_id);
create index idx_tp_affiliation on tournament_players(tournament_category_id, region_id, affiliation_name, team_label);


-- 선수번호 다음 값 (대회 스코프)
create or replace function next_player_number(p_tournament_id bigint)
returns int
language plpgsql
as $$
declare
  next_num int;
begin
  -- 사용된 최대 번호 + 1 (삭제분은 재사용 안 함)
  select coalesce(max(player_number), 0) + 1 into next_num
  from tournament_players
  where tournament_id = p_tournament_id;
  return next_num;
end;
$$;


-- 팀라벨 재계산 (종별 + 시/군 + 소속 단위)
-- 등록 순서대로 1~6 → A, 7~12 → B, 13~18 → C...
create or replace function recalc_team_labels(
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
  where tp.id = o.id;
end;
$$;


-- 트리거: 선수 INSERT/DELETE/UPDATE 시 같은 소속의 팀라벨 재계산
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

  if (tg_op = 'UPDATE' and (
        old.tournament_category_id is distinct from new.tournament_category_id
        or old.region_id <> new.region_id
        or old.affiliation_name <> new.affiliation_name)) then
    perform recalc_team_labels(old.tournament_category_id, old.region_id, old.affiliation_name);
  end if;

  return null;
end;
$$;

create trigger after_tp_change
after insert or update or delete on tournament_players
for each row execute function trg_recalc_team_labels();


-- ============================================================
-- ## 편성된 팀 (2/3/5인조)
-- ============================================================
create table tournament_teams (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  region_id smallint not null references regions(id),
  affiliation_name text not null,
  team_label text not null,                     -- 같은 (지역+소속+라벨)에서만 편성
  team_seq smallint not null default 1,         -- 같은 팀라벨 안에서 여러 팀 만들 때 (2인조 6명 → 2+2+2)
  created_at timestamptz not null default now(),
  unique (tournament_event_id, region_id, affiliation_name, team_label, team_seq)
);

create index idx_tt_event on tournament_teams(tournament_event_id);


-- ============================================================
-- ## 팀 구성원
-- ============================================================
create table tournament_team_members (
  id bigserial primary key,
  tournament_team_id bigint not null references tournament_teams(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  member_order smallint not null,               -- 표시 순서
  created_at timestamptz not null default now(),
  unique (tournament_team_id, tournament_player_id),
  unique (tournament_player_id)  -- 한 선수는 한 세부종목에서 한 팀에만
  -- 주의: 위 unique는 세부종목 통합 unique가 아님. event 별로 다른 unique 필요 시 partial index 추가
);

create index idx_ttm_team on tournament_team_members(tournament_team_id);
create index idx_ttm_player on tournament_team_members(tournament_player_id);


-- ============================================================
-- ## 조(Squad) 멤버십 (레인 부족 시 분반)
-- ============================================================
-- 행이 없으면 1조로 간주(분반 안 한 이벤트는 0행). 같은 팀은 같은 조(앱에서 보장).
create table event_squad_members (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  squad_number smallint not null default 1 check (squad_number between 1 and 8),
  created_at timestamptz not null default now(),
  unique (tournament_event_id, tournament_player_id)
);

create index idx_esm_event_squad on event_squad_members(tournament_event_id, squad_number);


-- ============================================================
-- ## 5인조 게임별 출전 명단
-- ============================================================
-- 한 게임에서 6명 로스터 중 5명만 starter (팀합산), 나머지 1명은 bench
create table event_lineups (
  id bigserial primary key,
  tournament_team_id bigint not null references tournament_teams(id) on delete cascade,
  game_number smallint not null,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  role lineup_role not null,
  created_at timestamptz not null default now(),
  unique (tournament_team_id, game_number, tournament_player_id)
);

create index idx_lineup_team_game on event_lineups(tournament_team_id, game_number);


-- ============================================================
-- ## 레인 배정
-- ============================================================
-- 1게임 기준 base_lane만 저장하고, 이후 게임은 lane_at_game()로 계산
create table lane_assignments (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  base_lane smallint not null,
  tournament_team_id bigint references tournament_teams(id) on delete cascade,  -- NULL=미편성/개인/메이크업 레인
  squad_number smallint not null default 1,     -- 조. base_lane은 조마다 중복 정상(같은 레인 순차 사용)
  is_makeup boolean not null default false,      -- true=서로 다른 소속/팀이 섞인 메이크업 레인(팀 아님, 개인점수만)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_la_event_lane on lane_assignments(tournament_event_id, base_lane);
create index idx_la_event_squad on lane_assignments(tournament_event_id, squad_number);


-- 한 레인 안의 개별 선수
-- half: 0 = 전 게임 적용(기본), 2 = 후반(게임 > halftime_split_at) 오버라이드.
--       후반 교체로 레인이 바뀐 선수만 half=2 행을 추가로 가진다.
create table lane_assignment_players (
  id bigserial primary key,
  lane_assignment_id bigint not null references lane_assignments(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  half smallint not null default 0 check (half in (0, 2)),
  created_at timestamptz not null default now(),
  unique (lane_assignment_id, tournament_player_id, half)
);

create index idx_lap_player on lane_assignment_players(tournament_player_id);


-- 게임별 실제 레인 계산 함수 (래핑 순환)
create or replace function lane_at_game(
  p_base_lane smallint,
  p_lane_start smallint,
  p_lane_end smallint,
  p_direction lane_move_direction,
  p_offset smallint,
  p_game_number smallint
)
returns smallint
language plpgsql
immutable
as $$
declare
  v_l int := (p_lane_end - p_lane_start + 1);
  v_dir int := case when p_direction = 'R' then 1 else -1 end;
  v_pos int;
begin
  if p_offset = 0 or v_l <= 1 then
    return p_base_lane;
  end if;
  v_pos := ((p_base_lane - p_lane_start) + v_dir * p_offset * (p_game_number - 1)) % v_l;
  if v_pos < 0 then
    v_pos := v_pos + v_l;
  end if;
  return (v_pos + p_lane_start)::smallint;
end;
$$;


-- ============================================================
-- ## 게임 상태 (마감 여부)
-- ============================================================
create table game_states (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  game_number smallint not null,
  squad_number smallint not null default 1,     -- 조별 마감(같은 레인 순차 진행)
  status game_status not null default 'open',
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  unique (tournament_event_id, squad_number, game_number)
);

create index idx_gs_event on game_states(tournament_event_id);


-- ============================================================
-- ## 점수
-- ============================================================
create table scores (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  game_number smallint not null,
  score smallint not null check (score between 0 and 300),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (tournament_event_id, tournament_player_id, game_number)
);

create index idx_scores_event_game on scores(tournament_event_id, game_number);
create index idx_scores_player on scores(tournament_player_id);


-- ============================================================
-- ## 랭킹 캐시 (개인)
-- ============================================================
create table rankings (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  games_played smallint not null default 0,
  total int not null default 0,
  avg numeric(6,2),
  high_game smallint,
  rank int,
  pin_diff_from_first int,
  updated_at timestamptz not null default now(),
  unique (tournament_event_id, tournament_player_id)
);

create index idx_rankings_event_rank on rankings(tournament_event_id, rank);


-- ============================================================
-- ## 랭킹 캐시 (팀)
-- ============================================================
create table team_rankings (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  tournament_team_id bigint not null references tournament_teams(id) on delete cascade,
  games_played smallint not null default 0,
  total int not null default 0,
  avg numeric(6,2),
  high_game int,
  rank int,
  pin_diff_from_first int,
  updated_at timestamptz not null default now(),
  unique (tournament_event_id, tournament_team_id)
);

create index idx_team_rankings_event_rank on team_rankings(tournament_event_id, rank);


-- ============================================================
-- ## 게임 마감 + 랭킹 재계산 함수
-- ============================================================
create or replace function refresh_rankings(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type event_type;
begin
  -- 1) 이벤트 타입 확인
  select e.event_type into v_event_type
  from tournament_events e where e.id = p_event_id;

  if v_event_type is null then
    raise exception 'Event % not found', p_event_id;
  end if;

  -- 2) 개인 랭킹 (각 선수는 자기 조가 마감한 게임까지만 합산)
  delete from rankings where tournament_event_id = p_event_id;

  insert into rankings (
    tournament_event_id, tournament_player_id,
    games_played, total, avg, high_game
  )
  select
    p_event_id,
    tp.id,
    count(s.score) filter (where s.score is not null),
    coalesce(sum(s.score), 0),
    case
      when count(s.score) > 0
      then round(sum(s.score)::numeric / count(s.score), 2)
      else null
    end,
    max(s.score)
  from tournament_players tp
  join tournament_team_members ttm on ttm.tournament_player_id = tp.id
  join tournament_teams tt on tt.id = ttm.tournament_team_id and tt.tournament_event_id = p_event_id
  left join event_squad_members esm
    on esm.tournament_event_id = p_event_id and esm.tournament_player_id = tp.id
  left join lateral (
    select coalesce(max(gs.game_number), 0) as max_locked
    from game_states gs
    where gs.tournament_event_id = p_event_id
      and gs.status = 'locked'
      and gs.squad_number = coalesce(esm.squad_number, 1)
  ) sq on true
  left join scores s
    on s.tournament_player_id = tp.id
   and s.tournament_event_id = p_event_id
   and s.game_number <= sq.max_locked
  group by tp.id

  union all

  -- 개인전: 팀 없음. 이벤트에 직접 참가
  select
    p_event_id,
    tp.id,
    count(s.score) filter (where s.score is not null),
    coalesce(sum(s.score), 0),
    case when count(s.score) > 0
         then round(sum(s.score)::numeric / count(s.score), 2)
         else null end,
    max(s.score)
  from tournament_events e
  join tournament_categories tc on tc.id = e.tournament_category_id
  join tournament_players tp on tp.tournament_id = tc.tournament_id
  left join event_squad_members esm
    on esm.tournament_event_id = p_event_id and esm.tournament_player_id = tp.id
  left join lateral (
    select coalesce(max(gs.game_number), 0) as max_locked
    from game_states gs
    where gs.tournament_event_id = p_event_id
      and gs.status = 'locked'
      and gs.squad_number = coalesce(esm.squad_number, 1)
  ) sq on true
  left join scores s
    on s.tournament_player_id = tp.id
   and s.tournament_event_id = p_event_id
   and s.game_number <= sq.max_locked
  where e.id = p_event_id
    and v_event_type = 'single'
    and not exists (
      select 1 from tournament_team_members ttm
      join tournament_teams tt on tt.id = ttm.tournament_team_id
      where ttm.tournament_player_id = tp.id and tt.tournament_event_id = p_event_id
    )
  group by tp.id;

  -- 3) 개인 랭킹 순위 매기기
  with ranked as (
    select id,
           rank() over (order by total desc, high_game desc nulls last, tournament_player_id) as r,
           first_value(total) over (order by total desc, high_game desc nulls last) as top_total
    from rankings
    where tournament_event_id = p_event_id
  )
  update rankings r
  set rank = ranked.r,
      pin_diff_from_first = r.total - ranked.top_total,
      updated_at = now()
  from ranked
  where r.id = ranked.id;

  -- 4) 팀 랭킹 (2인조/3인조/5인조)
  if v_event_type in ('double', 'triple', 'team5') then
    delete from team_rankings where tournament_event_id = p_event_id;

    insert into team_rankings (
      tournament_event_id, tournament_team_id,
      games_played, total, avg, high_game
    )
    select
      p_event_id,
      tt.id,
      g.games_played,
      coalesce(g.total, 0),
      case when g.games_played > 0
           then round(g.total::numeric / (g.games_played), 2)
           else null end,
      g.high_game
    from tournament_teams tt
    left join lateral (
      with team_squad as (
        -- 팀의 조 (멤버의 조; 앱이 togetherness 보장 → 단일값)
        select coalesce(min(esm.squad_number), 1) as squad_number
        from tournament_team_members ttm
        left join event_squad_members esm
          on esm.tournament_event_id = p_event_id
         and esm.tournament_player_id = ttm.tournament_player_id
        where ttm.tournament_team_id = tt.id
      ),
      per_game as (
        -- 게임별 팀 합산: 2/3인조는 모든 멤버, 5인조는 그 게임의 starter만
        select
          gs.game_number,
          case
            when v_event_type in ('double', 'triple') then
              (
                select sum(s.score)
                from tournament_team_members ttm
                left join scores s
                  on s.tournament_player_id = ttm.tournament_player_id
                 and s.tournament_event_id = p_event_id
                 and s.game_number = gs.game_number
                where ttm.tournament_team_id = tt.id
              )
            when v_event_type = 'team5' then
              (
                select sum(s.score)
                from event_lineups el
                left join scores s
                  on s.tournament_player_id = el.tournament_player_id
                 and s.tournament_event_id = p_event_id
                 and s.game_number = gs.game_number
                where el.tournament_team_id = tt.id
                  and el.game_number = gs.game_number
                  and el.role = 'starter'
              )
          end as team_game_total
        from game_states gs, team_squad ts
        where gs.tournament_event_id = p_event_id
          and gs.status = 'locked'
          and gs.squad_number = ts.squad_number
      )
      select
        count(team_game_total) filter (where team_game_total is not null) as games_played,
        sum(team_game_total) as total,
        max(team_game_total) as high_game
      from per_game
    ) g on true
    where tt.tournament_event_id = p_event_id;

    -- 팀 순위
    with team_ranked as (
      select id,
             rank() over (order by total desc, high_game desc nulls last, tournament_team_id) as r,
             first_value(total) over (order by total desc, high_game desc nulls last) as top_total
      from team_rankings
      where tournament_event_id = p_event_id
    )
    update team_rankings tr
    set rank = team_ranked.r,
        pin_diff_from_first = tr.total - team_ranked.top_total,
        updated_at = now()
    from team_ranked
    where tr.id = team_ranked.id;
  end if;
end;
$$;


-- 게임 마감 RPC (트랜잭션 단위) — p_squad_number 조별 마감 (기본 1)
create or replace function lock_game(p_event_id bigint, p_game_number smallint, p_squad_number smallint default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 권한 체크
  if not exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','super_admin')
  ) then
    raise exception 'Permission denied';
  end if;

  insert into game_states (tournament_event_id, game_number, squad_number, status, locked_at, locked_by)
  values (p_event_id, p_game_number, p_squad_number, 'locked', now(), auth.uid())
  on conflict (tournament_event_id, squad_number, game_number)
  do update set status = 'locked', locked_at = now(), locked_by = auth.uid();

  perform refresh_rankings(p_event_id);
end;
$$;

-- 게임 마감 해제 (super_admin만) — 조별
create or replace function unlock_game(p_event_id bigint, p_game_number smallint, p_squad_number smallint default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  ) then
    raise exception 'Permission denied';
  end if;

  update game_states
  set status = 'open', locked_at = null, locked_by = null
  where tournament_event_id = p_event_id
    and squad_number = p_squad_number
    and game_number = p_game_number;

  perform refresh_rankings(p_event_id);
end;
$$;


-- ============================================================
-- ## 감사 로그
-- ============================================================
create table audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  action text not null,                     -- e.g. 'game.lock', 'score.update'
  entity_type text not null,                -- e.g. 'tournament_event', 'score'
  entity_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_user on audit_logs(user_id, created_at desc);
create index idx_audit_entity on audit_logs(entity_type, entity_id);


-- ============================================================
-- ## 공통 updated_at 트리거
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger trg_players_updated_at before update on players for each row execute function set_updated_at();
create trigger trg_tournaments_updated_at before update on tournaments for each row execute function set_updated_at();
create trigger trg_tournament_players_updated_at before update on tournament_players for each row execute function set_updated_at();
create trigger trg_lane_assignments_updated_at before update on lane_assignments for each row execute function set_updated_at();


-- ============================================================
-- ## ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles                  enable row level security;
alter table regions                   enable row level security;
alter table affiliations              enable row level security;
alter table players                   enable row level security;
alter table tournaments               enable row level security;
alter table tournament_categories     enable row level security;
alter table tournament_events         enable row level security;
alter table tournament_players        enable row level security;
alter table tournament_teams          enable row level security;
alter table tournament_team_members   enable row level security;
alter table event_squad_members       enable row level security;
alter table event_lineups             enable row level security;
alter table lane_assignments          enable row level security;
alter table lane_assignment_players   enable row level security;
alter table game_states               enable row level security;
alter table scores                    enable row level security;
alter table rankings                  enable row level security;
alter table team_rankings             enable row level security;
alter table audit_logs                enable row level security;


-- ---------- 공개 SELECT 정책 ----------
-- 사용자 페이지에서 anon 키로 읽기만 허용

create policy "public read tournaments"        on tournaments              for select using (true);
create policy "public read categories"         on tournament_categories    for select using (true);
create policy "public read events"             on tournament_events        for select using (true);
create policy "public read regions"            on regions                  for select using (true);
create policy "public read affiliations"       on affiliations             for select using (true);
create policy "public read tournament_players" on tournament_players       for select using (true);
create policy "public read teams"              on tournament_teams         for select using (true);
create policy "public read team_members"       on tournament_team_members  for select using (true);
create policy "public read squad members"      on event_squad_members      for select using (true);
create policy "public read lineups"            on event_lineups            for select using (true);
create policy "public read lane_assignments"   on lane_assignments         for select using (true);
create policy "public read lane_players"       on lane_assignment_players  for select using (true);
create policy "public read game_states"        on game_states              for select using (true);
create policy "public read rankings"           on rankings                 for select using (true);
create policy "public read team_rankings"      on team_rankings            for select using (true);

-- scores는 마감된 게임만 공개 (선수의 조 기준 마감만; 단일조면 기존과 동일)
create policy "public read locked scores" on scores
  for select using (
    exists (
      select 1 from game_states gs
      where gs.tournament_event_id = scores.tournament_event_id
        and gs.game_number = scores.game_number
        and gs.status = 'locked'
        and gs.squad_number = coalesce(
          (select esm.squad_number from event_squad_members esm
           where esm.tournament_event_id = scores.tournament_event_id
             and esm.tournament_player_id = scores.tournament_player_id),
          1
        )
    )
  );

-- players 마스터: 공개 노출은 최소화 (자동완성만 필요)
-- (정책 미부여 → anon은 SELECT 불가, 관리자만 가능)


-- ---------- 관리자 정책 (admin / super_admin) ----------
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- profiles: 본인만 select/update, super_admin은 전체 관리
create policy "self read profile"         on profiles for select using (id = auth.uid() or is_super_admin());
create policy "self update profile"       on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "super admin manage profile" on profiles for all using (is_super_admin()) with check (is_super_admin());

-- 그 외 테이블: 관리자는 전부 가능 (SELECT는 위 public 정책으로도 통과되지만 일관성 위해 명시)
create policy "admin write tournaments"               on tournaments              for all using (is_admin()) with check (is_admin());
create policy "admin write categories"                on tournament_categories    for all using (is_admin()) with check (is_admin());
create policy "admin write events"                    on tournament_events        for all using (is_admin()) with check (is_admin());
create policy "admin write regions"                   on regions                  for all using (is_admin()) with check (is_admin());
create policy "admin write affiliations"              on affiliations             for all using (is_admin()) with check (is_admin());
create policy "admin write players"                   on players                  for all using (is_admin()) with check (is_admin());
create policy "admin write tournament_players"        on tournament_players       for all using (is_admin()) with check (is_admin());
create policy "admin write teams"                     on tournament_teams         for all using (is_admin()) with check (is_admin());
create policy "admin write team_members"              on tournament_team_members  for all using (is_admin()) with check (is_admin());
create policy "admin write squad members"             on event_squad_members      for all using (is_admin()) with check (is_admin());
create policy "admin write lineups"                   on event_lineups            for all using (is_admin()) with check (is_admin());
create policy "admin write lane_assignments"          on lane_assignments         for all using (is_admin()) with check (is_admin());
create policy "admin write lane_assignment_players"   on lane_assignment_players  for all using (is_admin()) with check (is_admin());
create policy "admin write game_states"               on game_states              for all using (is_admin()) with check (is_admin());
create policy "admin write scores"                    on scores                   for all using (is_admin()) with check (is_admin());
create policy "admin write rankings"                  on rankings                 for all using (is_admin()) with check (is_admin());
create policy "admin write team_rankings"             on team_rankings            for all using (is_admin()) with check (is_admin());
create policy "admin read audit_logs"                 on audit_logs               for select using (is_admin());
create policy "admin insert audit_logs"               on audit_logs               for insert with check (is_admin());


-- ============================================================
-- ## GRANTS — Supabase 기본 역할 권한 (스키마 reset 후 필수)
-- ============================================================
-- public 스키마를 drop/recreate한 경우 기본 권한이 사라지므로 명시 부여.
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- 이후 추가될 객체에도 자동 적용
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- 실제 접근 제어는 RLS 정책으로 강제됨.


-- ============================================================
-- ## SEED — 경기도 31개 시/군
-- ============================================================
insert into regions (name, sort_order) values
  ('수원시', 1), ('성남시', 2), ('의정부시', 3), ('안양시', 4), ('부천시', 5),
  ('광명시', 6), ('평택시', 7), ('동두천시', 8), ('안산시', 9), ('고양시', 10),
  ('과천시', 11), ('구리시', 12), ('남양주시', 13), ('오산시', 14), ('시흥시', 15),
  ('군포시', 16), ('의왕시', 17), ('하남시', 18), ('용인시', 19), ('파주시', 20),
  ('이천시', 21), ('안성시', 22), ('김포시', 23), ('화성시', 24), ('광주시', 25),
  ('양주시', 26), ('포천시', 27), ('여주시', 28),
  ('연천군', 29), ('가평군', 30), ('양평군', 31)
on conflict (name) do nothing;


-- ============================================================
-- ## SEED — 관리자 계정
-- ============================================================
-- ★ 주의 ★
-- Supabase Auth 사용자는 SQL로 직접 insert 할 수 없습니다.
-- 다음 중 하나로 admin@bowling.com / admin123 계정을 만드세요:
--
-- 방법 A) Supabase Dashboard > Authentication > Users > Add user
--   email: admin@bowling.com
--   password: admin123
--   auto-confirm user: ✅
--
-- 방법 B) Supabase JS Admin (service_role 키 사용):
--   await supabase.auth.admin.createUser({
--     email: 'admin@bowling.com',
--     password: 'admin123',
--     email_confirm: true
--   });
--
-- 계정 생성 후 handle_new_user() 트리거로 profiles에 자동 등록됩니다.
-- 이후 아래 쿼리로 super_admin으로 승격:

-- update profiles set role = 'super_admin' where email = 'admin@bowling.com';


-- ============================================================
-- ## 끝
-- ============================================================
