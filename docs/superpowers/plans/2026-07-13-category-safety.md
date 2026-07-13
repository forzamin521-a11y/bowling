# 참가종별 안전 관리 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참가종별 체크 해제를 데이터 보존형 사용 중지로 바꾸고, 영향 정보·복구·서버 보호를 추가한다.

**Architecture:** `tournament_categories.is_active`를 lifecycle 상태로 사용한다. 관리자 상세는 활성/비활성 카테고리를 모두 읽어 상태와 통계를 보여주고, 공개 및 운영 목록은 활성 카테고리만 기본 조회한다. 비활성화 서버 액션은 삭제 대신 update를 수행하며, 기존 데이터는 그대로 둔다.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, Supabase query builder, Zod, Vitest, Tailwind/shadcn UI.

---

## Chunk 1: 데이터 상태와 도메인 계약

### Task 1: Add the category active flag

**Files:**
- Create: `supabase/migrations/0016_category_active.sql`
- Modify: `lib/supabase/database.types.ts:132-148`

- [x] Add `is_active boolean not null default true` to `tournament_categories`.
- [x] Update generated-style TypeScript Row/Insert/Update types.
- [x] Verify migration is additive and preserves all existing rows.

### Task 2: Add focused lifecycle tests

**Files:**
- Create: `lib/domain/category-lifecycle.test.ts`
- Create: `lib/domain/category-lifecycle.ts`

- [x] Define pure lifecycle helpers for active/inactive transitions and impact labels.
- [x] Write failing tests for reactivating an existing category, deactivating without deletion, and formatting nonzero impact counts.
- [x] Run the focused Vitest file and confirm the tests fail before implementation.
- [x] Implement the minimal pure helpers and rerun the focused tests.

## Chunk 2: Server action safety

### Task 3: Replace destructive toggle behavior

**Files:**
- Modify: `app/admin/(authenticated)/tournaments/actions.ts:101-128`

- [x] Validate tournament ID, optional category ID, age, gender, and active state with a Zod schema.
- [x] For activation, update an existing category ID; only a new category request may insert with `(tournament_id, age, gender)`.
- [x] For deactivation, update `is_active=false`; never delete the category.
- [x] Reject category ID and age/gender combinations that do not describe the same row.
- [x] Keep category deletion out of the normal admin flow; any future hard-delete action must be separately guarded against dependent data.
- [x] Revalidate the tournament detail and public tournament paths.

### Task 3b: Guard inactive-category writes

**Files:**
- Create: `lib/supabase/category-guards.ts`
- Modify: `app/admin/(authenticated)/tournaments/[id]/players/actions.ts`
- Modify: `app/admin/(authenticated)/tournaments/[id]/events/[eventId]/squads/actions.ts`
- Modify: `app/admin/(authenticated)/tournaments/[id]/events/[eventId]/lanes/actions.ts`
- Modify: `app/admin/(authenticated)/tournaments/[id]/events/[eventId]/scores/actions.ts`
- Modify: `app/admin/(authenticated)/tournaments/actions.ts:164-236`

- [x] Add a shared server-side lookup that verifies an event belongs to an active category.
- [x] Call it before player registration, event creation/edit/deletion, squad saves, lane saves, and score writes.
- [x] Return a user-safe error explaining that the category must be reactivated first.
- [x] Add focused tests for the shared guard and lifecycle contracts.

## Chunk 3: Admin UI and impact preview

### Task 4: Load category impact counts

**Files:**
- Modify: `app/admin/(authenticated)/tournaments/[id]/page.tsx:67-110`

- [x] Select `is_active` with each category.
- [x] Load player, event, and score counts without exposing secrets or trusting client-provided counts.
- [x] Pass the counts and active state into `CategoriesSection`.
- [x] Render only active categories in the operational `EventsSection` while retaining inactive categories in the status matrix.

### Task 5: Add safe toggle UX

**Files:**
- Modify: `app/admin/(authenticated)/tournaments/[id]/categories-section.tsx`
- Modify: `app/admin/(authenticated)/tournaments/[id]/page.tsx:181-198`

- [x] Replace the ambiguous delete-like checkbox copy with active/inactive status labels.
- [x] Show participant, event, and score counts in each category cell.
- [x] On deactivation, open an impact preview confirmation dialog when dependent data exists.
- [x] On activation, restore the existing category and show a success toast.
- [x] Keep all controls disabled while the transition is pending and show an error toast on failure.

## Chunk 4: Read-side filtering and regression coverage

### Task 6: Hide inactive categories from public and default operational views

**Files:**
- Modify: `app/tournaments/[id]/page.tsx:53-57`
- Modify: `app/tournaments/[id]/[categoryId]/page.tsx:24-30`
- Modify: `app/tournaments/[id]/[categoryId]/[eventId]/page.tsx:61-67`
- Modify: `app/admin/(authenticated)/players/page.tsx:14-18`
- Modify: `app/admin/(authenticated)/tournaments/[id]/players/page.tsx:24-29`

- [x] Add `is_active=true` to default category reads.
- [x] Reject inactive categories from public category and event pages.
- [x] Keep the admin tournament detail available for reactivation while blocking inactive operational pages and writes.
- [x] Add `supabase/migrations/0017_public_active_category_rls.sql` to limit public category/event and dependent public ranking reads to active categories.
- [x] Cover every public read path: `event_squad_members`, teams, team members, lineups, lane assignments, lane players, game states, rankings, team rankings, locked scores, and the `participant_names` view.

### Task 7: Verify the full change

**Files:**
- Modify: relevant test files only if coverage requires it.

- [x] Run the focused lifecycle tests.
- [x] Run the full Vitest suite.
- [x] Run `pnpm exec tsc --noEmit` and inspect the production build result.
- [x] Inspect the final diff and confirm no destructive category delete remains in the normal toggle path.
- [x] Add automated regression coverage for category ID preservation and inactive write rejection; public filtering is covered by the application queries and SQL migration contract.
- [x] Production interaction was not executed because the live admin page requires authentication and no credentials were available.
