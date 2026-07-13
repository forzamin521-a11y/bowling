-- ============================================================
-- 0016 참가종별 사용 중지 상태
-- ============================================================
-- 종별을 숨겨도 선수·세부종목·레인·점수 데이터는 보존한다.

alter table tournament_categories
  add column if not exists is_active boolean not null default true;

create index if not exists idx_tournament_categories_active
  on tournament_categories(tournament_id, is_active);
