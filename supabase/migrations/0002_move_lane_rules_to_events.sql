-- 레인 이동 규칙(방향/칸 수)을 대회 단위 → 세부종목 단위로 이동.
-- tournaments_with_status 뷰가 tournaments.*를 참조하므로 잠깐 내렸다가 재생성한다.
-- 멱등적으로 재실행 가능하도록 if not exists / if exists 사용.

-- 1) tournament_events에 컬럼 추가
alter table tournament_events
  add column if not exists lane_move_direction lane_move_direction not null default 'R',
  add column if not exists lane_move_offset    smallint            not null default 0;

-- 2) check 제약 (이름 기반 중복 방지)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_events_lane_offset_check'
  ) then
    alter table tournament_events
      add constraint tournament_events_lane_offset_check
      check (lane_move_offset >= 0);
  end if;
end $$;

-- 3) 의존 뷰 임시 제거
drop view if exists tournaments_with_status;

-- 4) tournaments에서 컬럼 제거
alter table tournaments
  drop column if exists lane_move_direction,
  drop column if exists lane_move_offset;

-- 5) 뷰 재생성
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
