# 참가종별 성별 열 동일 너비 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 참가종별 표의 남자·여자 열을 정확히 같은 너비로 만들고 한국어 문구가 단어 중간에서 끊기지 않게 한다.

**Architecture:** 기존 semantic table과 가로 스크롤 구조를 유지한다. `table-fixed`와 `colgroup`으로 첫 열을 `7rem`, 두 성별 열을 각각 `calc((100% - 7rem) / 2)`로 지정하고, 카드 문구는 `break-keep`과 의미 단위 `whitespace-nowrap` 요소로 제어한다.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, TypeScript.

---

## Chunk 1: 열 너비와 줄바꿈 수정

### Task 1: 참가종별 표 레이아웃 고정

**Files:**
- Modify: `app/admin/(authenticated)/tournaments/[id]/categories-section.tsx:145-225`
- Reference: `docs/superpowers/specs/2026-07-13-category-column-width-design.md`

- [ ] **Step 1: 현재 렌더링 너비 차이 확인**

`.env.local`이 구성된 상태에서 `pnpm exec next dev --hostname 127.0.0.1 --port 3000`으로 개발 서버를 실행한다. `/admin/login`에서 프로젝트에 구성된 관리자 계정으로 로그인한 뒤 `/admin/tournaments/2`를 연다. 현재 이 대회는 고등부 남자가 `사용 중`, 여자가 `미등록`이어서 좌우 콘텐츠가 다른 재현 조건을 제공한다.

참가종별 표의 남자·여자 헤더 셀과 고등부 행의 `getBoundingClientRect().width`를 확인한다.

Expected: 콘텐츠가 다른 상태에서는 두 값이 달라 현재 문제가 재현된다.

- [ ] **Step 2: 고정 열 레이아웃 구현**

`table`에 `data-category-table`과 `table-fixed`를 추가하고 다음 `colgroup`을 `thead` 앞에 넣는다.

```tsx
<colgroup>
  <col className="w-28" />
  <col style={{ width: "calc((100% - 7rem) / 2)" }} />
  <col style={{ width: "calc((100% - 7rem) / 2)" }} />
</colgroup>
```

첫 번째 헤더와 셀에는 필요 시 `w-28`을 함께 적용해 종별 열이 줄어들지 않게 한다.

- [ ] **Step 3: 단어·집계 항목 단위 줄바꿈 구현**

상태 문구는 아이콘과 함께 `whitespace-nowrap`으로 유지한다. 집계 문구는 다음처럼 항목별로 분리한다.

```tsx
<span className="flex flex-wrap gap-x-1.5 gap-y-0.5 break-keep text-[11px] leading-tight text-muted-foreground">
  <span className="whitespace-nowrap">참가자 {category.playerCount}명</span>
  <span className="whitespace-nowrap">세부종목 {category.eventCount}개</span>
  {category.scoreCount > 0 ? (
    <span className="whitespace-nowrap">점수 {category.scoreCount}건</span>
  ) : null}
</span>
```

`눌러서 추가`에도 `break-keep`을 적용한다.

- [ ] **Step 4: 정적 검증 실행**

Run: `pnpm test`

Expected: 32 tests pass.

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0.

Run: `pnpm build`

Expected: production build succeeds.

- [ ] **Step 5: 브라우저 레이아웃 검증**

데스크톱과 좁은 화면에서 다음 코드를 브라우저 페이지 컨텍스트에서 실행한다.

```js
const table = document.querySelector("[data-category-table]");
const widths = [...table.rows].map((row) => ({
  male: row.cells[1].getBoundingClientRect().width,
  female: row.cells[2].getBoundingClientRect().width,
}));
const equal = widths.every(({ male, female }) => Math.abs(male - female) <= 1);
({ widths, equal });
```

Expected: 모든 행에서 `equal === true`. `미등록`과 `사용 중`처럼 좌우 콘텐츠가 달라도 동일해야 하며, 집계 문구는 항목 내부가 아닌 항목 사이에서만 줄바꿈되어야 한다.

이 저장소에는 React component/E2E 테스트 러너가 없고 기존 Vitest는 도메인 테스트만 수행한다. 브라우저 table layout은 정적 클래스 검사보다 실제 `getBoundingClientRect()` 측정이 정확하므로, 이번 변경은 위 수치 검증을 표적 회귀 검사로 사용한다.

- [ ] **Step 6: 커밋**

```bash
git add app/admin/(authenticated)/tournaments/[id]/categories-section.tsx docs/superpowers/plans/2026-07-13-category-column-width.md
git commit -m "fix: equalize category gender columns"
```
