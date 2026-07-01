-- ============================================================
-- 0009 조(Squad) — 레인 부족 시 선수를 여러 조로 나눠 같은 레인을 순차 사용
-- ============================================================
-- 핵심 불변식: squad_count=1(기본)이면 모든 동작이 기존과 100% 동일.
-- 신규 컬럼 default 1, refresh_rankings는 단일 조일 때 기존과 동일 결과로 환원.
-- 멱등적으로 재실행 가능.

-- ---------- 1) tournament_events.squad_count ----------
alter table tournament_events
  add column if not exists squad_count smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_events_squad_count_check') then
    alter table tournament_events
      add constraint tournament_events_squad_count_check check (squad_count between 1 and 8);
  end if;
end $$;

-- ---------- 2) event_squad_members (조 멤버십, 선수 단위) ----------
-- 행이 없으면 1조로 간주(분반 안 한 이벤트는 0행). 팀 togetherness는 앱에서 보장.
create table if not exists event_squad_members (
  id bigserial primary key,
  tournament_event_id bigint not null references tournament_events(id) on delete cascade,
  tournament_player_id bigint not null references tournament_players(id) on delete cascade,
  squad_number smallint not null default 1 check (squad_number between 1 and 8),
  created_at timestamptz not null default now(),
  unique (tournament_event_id, tournament_player_id)
);
create index if not exists idx_esm_event_squad
  on event_squad_members(tournament_event_id, squad_number);

alter table event_squad_members enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'event_squad_members' and policyname = 'public read squad members') then
    create policy "public read squad members" on event_squad_members for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'event_squad_members' and policyname = 'admin write squad members') then
    create policy "admin write squad members" on event_squad_members for all using (is_admin()) with check (is_admin());
  end if;
end $$;

grant all on event_squad_members to anon, authenticated, service_role;
grant all on sequence event_squad_members_id_seq to anon, authenticated, service_role;

-- ---------- 3) lane_assignments.squad_number ----------
alter table lane_assignments
  add column if not exists squad_number smallint not null default 1;
create index if not exists idx_la_event_squad
  on lane_assignments(tournament_event_id, squad_number);

-- ---------- 4) game_states.squad_number + unique 교체 ----------
alter table game_states
  add column if not exists squad_number smallint not null default 1;

-- 기존 unique(tournament_event_id, game_number) 를 컬럼 조합으로 동적 탐색해 drop
do $$
declare
  v_con text;
begin
  select c.conname into v_con
  from pg_constraint c
  where c.conrelid = 'game_states'::regclass
    and c.contype = 'u'
    and c.conkey = array(
      select attnum from pg_attribute
      where attrelid = 'game_states'::regclass
        and attname in ('tournament_event_id', 'game_number')
      order by attnum
    );
  if v_con is not null then
    execute format('alter table game_states drop constraint %I', v_con);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_states_event_squad_game_key') then
    alter table game_states
      add constraint game_states_event_squad_game_key
      unique (tournament_event_id, squad_number, game_number);
  end if;
end $$;

-- ---------- 5) lock_game / unlock_game : p_squad_number 추가 ----------
-- PostgREST 오버로드 모호성 방지: 기존 2-인자 시그니처 drop 후 3-인자 재생성.
drop function if exists lock_game(bigint, smallint);
drop function if exists unlock_game(bigint, smallint);

create or replace function lock_game(
  p_event_id bigint,
  p_game_number smallint,
  p_squad_number smallint default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role in ('admin','super_admin')
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

create or replace function unlock_game(
  p_event_id bigint,
  p_game_number smallint,
  p_squad_number smallint default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
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

-- ---------- 5b) 공개 점수 RLS : 선수 조 기준 마감만 노출 (단일조면 기존과 동일) ----------
drop policy if exists "public read locked scores" on scores;
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

-- ---------- 6) refresh_rankings : 조별 마감게임 반영 (단일조면 기존과 동일) ----------
create or replace function refresh_rankings(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type event_type;
begin
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

  -- 4) 팀 랭킹 (2인조/3인조/5인조) — 팀의 조가 마감한 게임만 합산
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
