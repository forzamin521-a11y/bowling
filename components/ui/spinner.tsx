import { cn } from "@/lib/utils"

/**
 * 로딩 스피너. `currentColor`를 따르며 `size-*` 유틸로 크기를 조절한다.
 * 아이콘 라이브러리에 의존하지 않도록 인라인 SVG로 구현.
 *
 * 기본은 장식용(aria-hidden) — 텍스트 라벨이 있는 버튼 안에 넣어도
 * 스크린리더가 중복 안내하지 않는다. 스피너 자체가 유일한 로딩 표시일
 * 때는 `label`을 주면 role="status"로 안내된다.
 */
function Spinner({
  className,
  label,
  ...props
}: React.SVGProps<SVGSVGElement> & { label?: string }) {
  const a11y = label
    ? { role: "status", "aria-label": label }
    : { "aria-hidden": true as const, focusable: false }

  return (
    <svg
      {...a11y}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-4 animate-spin text-current", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export { Spinner }
