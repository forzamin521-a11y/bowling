# 경기도볼링협회 대회 운영 시스템

선수등록 → 팀편성 → 레인배정 → 점수입력 → 실시간 랭킹까지 대회 운영 전 과정을 처리하는 웹앱.

- **관리자**(로그인): 대회/선수/팀/레인/점수 관리
- **공개 사용자**(로그인 없음): 대회 결과·배정 레인 조회

## 기술 스택

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** · **shadcn/ui** (base-ui 기반)
- **Supabase** (Postgres + Auth + RLS + Realtime)
- **@dnd-kit** (레인 수동 배정) · **Vitest** (도메인 단위 테스트)

## 빠른 시작

```bash
pnpm install
cp .env.local.example .env.local   # Supabase URL / anon key 입력
pnpm dev                            # http://localhost:3000
```

### 환경변수 (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # 시드 스크립트용 (선택)
NEXT_PUBLIC_SITE_URL=...
```

앱은 샘플 데이터 fallback 없이 위 환경변수의 Supabase 프로젝트를 직접 조회합니다.
로컬 연결 확인은 `pnpm env:check`로 실행할 수 있습니다.

## 데이터베이스 마이그레이션

Supabase SQL Editor에서 순서대로 실행:

| 파일 | 내용 |
|---|---|
| `0001_initial_schema.sql` | 전체 스키마 · RLS · 함수 · 시/군 31개 시드 |
| `0002_move_lane_rules_to_events.sql` | 레인 이동 규칙을 세부종목 단위로 |
| `0003_move_lanes_to_events.sql` | 사용 레인 범위를 세부종목 단위로 |
| `0004_public_views.sql` | 공개 선수명 뷰(`participant_names`) · Realtime 발행 |

> `0004` 는 공개 랭킹의 **선수명 노출**과 **실시간 갱신**에 필수입니다.

초기 관리자 계정: `admin@bowling.com` / `admin123` (`role = super_admin`)

## 명령어

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm test         # 도메인 단위 테스트 (vitest)
pnpm tsc --noEmit # 타입 체크
pnpm env:check    # .env.local 실제 Supabase 연결 확인
```

## 구조

### 관리자 (`/admin`, `proxy.ts` 로 인증 가드)

```
대회 관리      /admin/tournaments           대회·종별·세부종목 CRUD
선수 등록      .../[id]/players             일괄 등록·마스터 매칭·팀라벨
팀 편성        .../events/[eventId]/teams   그룹·인원 검증·5인조 출전 선택
레인 배정      .../events/[eventId]/lanes    dnd-kit 수동 + 랜덤 균등 분산
점수 입력      .../events/[eventId]/scores   디바운스 저장·게임 마감·5인조 교체
```

### 공개 (로그인 불필요)

```
/                                  대회 목록
/tournaments/[id]                  종별 그리드
/tournaments/[id]/[categoryId]     세부종목 목록
/tournaments/[id]/[categoryId]/[eventId]   랭킹(팀/개인) + 배정 레인
```

### 도메인 순수 함수 (`lib/domain/`, 테스트 대상)

- `lane-rotation.ts` — 게임별 레인 래핑 순환 (DB `lane_at_game` 와 동일)
- `lane-assign.ts` — 랜덤 레인 균등 분산
- `team-label.ts` — 6명 단위 팀 라벨(A/B/C…)
- `labels.ts` — 종별/성별/세부종목 표시 라벨

## 핵심 도메인 규칙

- **팀 라벨**: 같은 (시군+소속) 그룹에서 등록 순서 6명 단위로 A, B, C…
- **선수번호**: 대회 내 1부터, 삭제분 재사용 안 함
- **팀 편성**: 같은 (시군+소속+팀라벨)끼리만. 2인조 2명 / 3인조 3명 / 5인조 5~6명
- **레인 이동**: 사용 레인 범위 내 래핑 순환. 한 레인 최대 6명(하드 캡)
- **랭킹**: 마감된 게임만 합산. 동점은 최고게임 높은 순. 핀차 = 본인 합계 − 1위 합계
- **5인조**: 게임별 출전 5명만 팀 합산. 후반전 교체는 점수 화면에서

## 배포 (Vercel)

1. Vercel 프로젝트 생성 → 환경변수 등록
2. Supabase 프로젝트에 마이그레이션 0001~0004 적용
3. `pnpm build` 통과 확인 후 배포

## 남은 작업 (선택)

- Supabase 정식 `supabase login` + `gen types` 로 타입 자동 생성
- Playwright E2E (관리자 핵심 흐름)
- 엑셀/PDF 출력, 대회 복제, 시군별 통계 등 (`04_향후계획.md` §9)
