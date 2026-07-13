-- ============================================================
-- 0017 비활성 종별 공개 조회 차단
-- ============================================================
-- 관리자 정책은 별도로 유지되므로 관리자는 비활성 행을 복구할 수 있다.

drop policy if exists "public read categories" on tournament_categories;
create policy "public read categories" on tournament_categories
  for select using (is_active);

drop policy if exists "public read events" on tournament_events;
create policy "public read events" on tournament_events
  for select using (
    exists (
      select 1
      from tournament_categories tc
      where tc.id = tournament_events.tournament_category_id
        and tc.is_active
    )
  );

drop policy if exists "public read tournament_players" on tournament_players;
create policy "public read tournament_players" on tournament_players
  for select using (
    exists (
      select 1
      from tournament_categories tc
      where tc.id = tournament_players.tournament_category_id
        and tc.is_active
    )
  );

drop policy if exists "public read teams" on tournament_teams;
create policy "public read teams" on tournament_teams
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = tournament_teams.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read team_members" on tournament_team_members;
create policy "public read team_members" on tournament_team_members
  for select using (
    exists (
      select 1
      from tournament_teams tt
      join tournament_events e on e.id = tt.tournament_event_id
      join tournament_categories tc on tc.id = e.tournament_category_id
      where tt.id = tournament_team_members.tournament_team_id
        and tc.is_active
    )
  );

drop policy if exists "public read squad members" on event_squad_members;
create policy "public read squad members" on event_squad_members
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = event_squad_members.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read lineups" on event_lineups;
create policy "public read lineups" on event_lineups
  for select using (
    exists (
      select 1
      from tournament_teams tt
      join tournament_events e on e.id = tt.tournament_event_id
      join tournament_categories tc on tc.id = e.tournament_category_id
      where tt.id = event_lineups.tournament_team_id
        and tc.is_active
    )
  );

drop policy if exists "public read lane_assignments" on lane_assignments;
create policy "public read lane_assignments" on lane_assignments
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = lane_assignments.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read lane_players" on lane_assignment_players;
create policy "public read lane_players" on lane_assignment_players
  for select using (
    exists (
      select 1
      from lane_assignments la
      join tournament_events e on e.id = la.tournament_event_id
      join tournament_categories tc on tc.id = e.tournament_category_id
      where la.id = lane_assignment_players.lane_assignment_id
        and tc.is_active
    )
  );

drop policy if exists "public read game_states" on game_states;
create policy "public read game_states" on game_states
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = game_states.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read rankings" on rankings;
create policy "public read rankings" on rankings
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = rankings.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read team_rankings" on team_rankings;
create policy "public read team_rankings" on team_rankings
  for select using (
    exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = team_rankings.tournament_event_id
        and tc.is_active
    )
  );

drop policy if exists "public read locked scores" on scores;
create policy "public read locked scores" on scores
  for select using (
    exists (
      select 1
      from game_states gs
      where gs.tournament_event_id = scores.tournament_event_id
        and gs.game_number = scores.game_number
        and gs.status = 'locked'
    )
    and exists (
      select 1
      from tournament_events e
      join tournament_categories tc on tc.id = e.tournament_category_id
      where e.id = scores.tournament_event_id
        and tc.is_active
    )
  );

create or replace view participant_names as
select tp.id as tournament_player_id, p.name
from tournament_players tp
join players p on p.id = tp.player_id
join tournament_categories tc on tc.id = tp.tournament_category_id
where tc.is_active;
