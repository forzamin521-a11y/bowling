-- 사용 레인(시작/끝)을 대회 단위 → 세부종목 단위로 이동.
-- 의존 뷰(tournaments_with_status) 잠시 내렸다 재생성.
-- 멱등적으로 재실행 가능.

-- 1) tournament_events에 컬럼 추가 (NULL 허용 — 신규 세부종목 등록 시점에 값 입력)
alter table tournament_events
  add column if not exists lane_start smallint,
  add column if not exists lane_end   smallint;

-- 2) 범위 check 제약
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_events_lane_range_check'
  ) then
    alter table tournament_events
      add constraint tournament_events_lane_range_check
      check (
        (lane_start is null and lane_end is null)
        or (
          lane_start is not null
          and lane_end is not null
          and lane_start >= 1
          and lane_end   >= lane_start
        )
      );
  end if;
end $$;

-- 3) 의존 뷰 임시 제거
drop view if exists tournaments_with_status;

-- 4) tournaments에서 컬럼 제거
alter table tournaments
  drop column if exists lane_start,
  drop column if exists lane_end;

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
