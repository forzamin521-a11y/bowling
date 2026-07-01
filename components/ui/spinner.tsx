import { cn } from "@/lib/utils"

/**
 * 로딩 스피너. `currentColor`를 따르며 `size-*` 유틸로 크기를 조절한다.
 * 아이콘 라이브러리에 의존하지 않도록 인라인 SVG로 구현.
 */
function Spinner({
  className,
  label = "로딩 중",
  ...props
}: React.SVGProps<SVGSVGElement> & { label?: string }) {
  return (
    <svg
      role="status"
      aria-label={label}
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
