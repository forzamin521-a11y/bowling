-- ============================================================
-- profiles.role 을 auth.users.raw_app_meta_data 에 동기화
-- → JWT 의 app_metadata.role 로 포함되어 미들웨어(proxy.ts)가
--   DB 조회 없이 역할을 읽을 수 있게 한다.
-- ============================================================

-- 1) 기존 사용자 백필: profiles.role 을 app_metadata.role 로 반영
update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', p.role::text)
from public.profiles p
where p.id = u.id
  and coalesce(u.raw_app_meta_data ->> 'role', '') is distinct from p.role::text;

-- 2) profiles.role 변경/삽입 시 auth.users 에 반영하는 트리거 함수
create or replace function public.sync_role_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

-- 3) 트리거 연결 (role 변경 또는 신규 프로필 생성 시)
drop trigger if exists trg_sync_role_to_auth on public.profiles;
create trigger trg_sync_role_to_auth
after insert or update of role on public.profiles
for each row execute function public.sync_role_to_auth();
