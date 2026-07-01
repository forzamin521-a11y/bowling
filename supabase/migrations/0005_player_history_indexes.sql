-- ============================================================
-- 0005 선수 마스터 이력 조회 최적화 인덱스
-- ============================================================
-- 선수 프로필은 한 선수의 모든 대회 참가/점수/랭킹을 가로질러 읽는다.
-- 읽기 경로를 빠르게 하고(쓰기 비용은 인덱스 1줄씩의 소폭 증가) 균형을 맞춘다.

-- 한 선수의 모든 대회 참가 조회: where player_id = ?
-- (기존 unique(tournament_id, player_id) 는 tournament_id 선행이라 단독 player_id 조회에 비효율)
create index if not exists idx_tp_player on tournament_players(player_id);

-- 한 선수의 종목별 개인 랭킹/성적 조회: where tournament_player_id = ?
-- (기존 인덱스는 (tournament_event_id, rank) 라 선수 기준 조회에 비효율)
create index if not exists idx_rankings_player on rankings(tournament_player_id);

-- 마스터 선수 소속 부분일치 검색
create index if not exists idx_players_aff_trgm
  on players using gin (affiliation_name gin_trgm_ops);
