-- ============================================================
-- 0013 팀 평균(team_rankings.avg) 계산 수정
-- ============================================================
-- 문제: 팀 평균을 team_total / games_played 로 계산해서, 5인조(5명)가
--       4게임 친 합계 4867이면 4867/4 = 1216.75 가 평균으로 표시됨.
-- 수정: 합계에 실제로 기여한 "개인 점수 개수"로 나눈다.
--       5명이 4게임 → 점수 20개 → 4867/20 = 243.35.
--       (double=2명, triple=3명, team5=그 게임 starter 5명 기준)
-- games_played(게임수)·total(합계)·high_game(팀 최고게임)은 그대로 유지.
-- 멱등적으로 재실행 가능.

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

  -- 2) 개인 랭킹 (각 선수는 자기 조가 마감한 게임까지만 자기 점수 합산)
  delete from rankings where tournament_event_id = p_event_id;

  insert into rankings (
    tournament_event_id, tournament_player_id,
    games_played, total, avg, high_game
  )
  -- 팀 종목: 이벤트 참가자 전체(팀 멤버 ∪ 레인배정 ∪ 점수보유) — 개인 레인 솔로 선수 포함
  select
    p_event_id,
    pa.pid,
    count(s.score) filter (where s.score is not null),
    coalesce(sum(s.score), 0),
    case
      when count(s.score) > 0
      then round(sum(s.score)::numeric / count(s.score), 2)
      else null
    end,
    max(s.score)
  from (
    select ttm.tournament_player_id as pid
    from tournament_team_members ttm
    join tournament_teams tt
      on tt.id = ttm.tournament_team_id
     and tt.tournament_event_id = p_event_id
    union
    select lap.tournament_player_id
    from lane_assignment_players lap
    join lane_assignments la
      on la.id = lap.lane_assignment_id
     and la.tournament_event_id = p_event_id
    union
    select s2.tournament_player_id
    from scores s2
    where s2.tournament_event_id = p_event_id
  ) pa
  left join event_squad_members esm
    on esm.tournament_event_id = p_event_id and esm.tournament_player_id = pa.pid
  left join lateral (
    select coalesce(max(gs.game_number), 0) as max_locked
    from game_states gs
    where gs.tournament_event_id = p_event_id
      and gs.status = 'locked'
      and gs.squad_number = coalesce(esm.squad_number, 1)
  ) sq on true
  left join scores s
    on s.tournament_player_id = pa.pid
   and s.tournament_event_id = p_event_id
   and s.game_number <= sq.max_locked
  where v_event_type <> 'single'
  group by pa.pid

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
  --    team5 는 그 게임의 starter 5명만 합산.
  --    avg 는 게임수가 아니라 "기여한 개인 점수 개수"로 나눈다.
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
      case when g.score_count > 0
           then round(g.total::numeric / g.score_count, 2)
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
        select
          gs.game_number,
          pg.team_game_total,
          pg.team_game_scores
        from game_states gs
        cross join team_squad ts
        left join lateral (
          select
            sum(s.score) as team_game_total,
            count(s.score) as team_game_scores
          from (
            -- 기여 선수: double/triple = 팀 멤버, team5 = 그 게임 starter
            select ttm.tournament_player_id as pid
            from tournament_team_members ttm
            where v_event_type in ('double', 'triple')
              and ttm.tournament_team_id = tt.id
            union all
            select el.tournament_player_id as pid
            from event_lineups el
            where v_event_type = 'team5'
              and el.tournament_team_id = tt.id
              and el.game_number = gs.game_number
              and el.role = 'starter'
          ) c
          left join scores s
            on s.tournament_player_id = c.pid
           and s.tournament_event_id = p_event_id
           and s.game_number = gs.game_number
        ) pg on true
        where gs.tournament_event_id = p_event_id
          and gs.status = 'locked'
          and gs.squad_number = ts.squad_number
      )
      select
        count(team_game_total) filter (where team_game_total is not null) as games_played,
        sum(team_game_total) as total,
        sum(team_game_scores) as score_count,
        max(team_game_total) as high_game
      from per_game
    ) g on true
    where tt.tournament_event_id = p_event_id;

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

-- 기존 캐시 재계산: 모든 종목에 대해 refresh_rankings 재실행
do $$
declare r record;
begin
  for r in select id from tournament_events loop
    perform refresh_rankings(r.id);
  end loop;
end $$;
