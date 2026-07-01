-- 0012_makeup_lane.sql
-- 레인배정 단계에서 팀을 직접 구성하도록 통합하면서,
-- 서로 다른 소속/팀이 한 레인에 섞인 "메이크업 레인"을 표시하기 위한 플래그 추가.
-- 메이크업 레인은 팀이 아니며(tournament_team_id NULL) 개인 점수만 기록한다.

alter table lane_assignments
  add column if not exists is_makeup boolean not null default false;
