-- ============================================================
-- 0006 팀라벨 재계산 트리거 무한 재귀 수정
-- ============================================================
-- 문제: after_tp_change (AFTER INSERT/UPDATE/DELETE) → recalc_team_labels() 가
--       tournament_players 를 UPDATE → 그 UPDATE 가 다시 트리거를 발화 → 무한 재귀
--       → "stack depth limit exceeded" (선수 등록/수정/삭제 시).
--
-- 해결: 트리거가 "최상위 문장"에서만 동작하도록 pg_trigger_depth() = 0 가드를 추가.
--       recalc_team_labels() 가 만드는 중첩 UPDATE(깊이 1)는 트리거를 재발화하지 않음.

drop trigger if exists after_tp_change on tournament_players;

create trigger after_tp_change
after insert or update or delete on tournament_players
for each row
when (pg_trigger_depth() = 0)
execute function trg_recalc_team_labels();

-- 보강: 라벨이 실제로 바뀌는 행만 갱신해 불필요한 쓰기/updated_at 변경을 줄임.
create or replace function recalc_team_labels(
  p_tournament_id bigint,
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
    where tournament_id = p_tournament_id
      and region_id = p_region_id
      and affiliation_name = p_affiliation_name
  )
  update tournament_players tp
  set team_label = chr(65 + ((o.rn - 1) / 6)::int),
      updated_at = now()
  from ordered o
  where tp.id = o.id
    and tp.team_label is distinct from chr(65 + ((o.rn - 1) / 6)::int);
end;
$$;
