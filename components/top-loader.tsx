"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * 페이지 이동 시 화면 상단에 표시되는 진행바 (GitHub/YouTube 스타일).
 *
 * 동작 방식:
 * - 내부 링크(<a>) 클릭 또는 뒤로/앞으로(popstate)를 감지해 시작
 * - 실제 라우트(pathname/searchParams)가 바뀌면 100%까지 채우고 사라짐
 * - 네비게이션이 취소돼도 안전 타임아웃으로 자동 정리
 * - start()/done()은 멱등: 이미 진행 중이면 다시 시작하지 않아 깜빡임이 없다
 *
 * Suspense 경계 안에서 렌더해야 한다(useSearchParams 요구사항).
 */
function TopLoaderInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  const activeRef = useRef(false)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current)
      trickleRef.current = null
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current)
      hideRef.current = null
    }
    if (safetyRef.current) {
      clearTimeout(safetyRef.current)
      safetyRef.current = null
    }
  }, [])

  const done = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    clearTimers()
    setProgress(100)
    hideRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 250)
  }, [clearTimers])

  const start = useCallback(() => {
    // 이미 진행 중이면 무시 (중복 시작으로 인한 되감김/깜빡임 방지)
    if (activeRef.current) return
    activeRef.current = true
    clearTimers()
    setVisible(true)
    setProgress(8)
    // 90%까지 서서히 차오르게 (실제 완료는 라우트 변경 시)
    trickleRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p
        const inc = p < 20 ? 10 : p < 50 ? 4 : p < 80 ? 2 : 0.5
        return Math.min(p + inc, 90)
      })
    }, 300)
    // 네비게이션이 취소돼 라우트가 안 바뀌는 경우를 대비한 안전장치
    safetyRef.current = setTimeout(() => done(), 8000)
  }, [clearTimers, done])

  // 라우트가 실제로 바뀌면 완료 처리 (진행 중이 아닐 땐 done()이 no-op)
  useEffect(() => {
    done()
  }, [pathname, searchParams, done])

  // 링크 클릭 및 뒤로/앞으로 이동 감지 → 시작
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      // 좌클릭 + 수식키 없는 경우만 (새 탭 열기 등 제외)
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return
      if (anchor.hasAttribute("download")) return
      if (anchor.getAttribute("aria-disabled") === "true") return
      const anchorTarget = anchor.getAttribute("target")
      if (anchorTarget && anchorTarget !== "_self") return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      // 외부 링크 제외
      if (url.origin !== window.location.origin) return
      // 라우트가 바뀌지 않는 이동(동일 경로/해시 이동)은 제외 —
      // 시작해도 라우트 변경이 없어 진행바가 멈춰 있게 된다
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }
      start()
    }

    function onPopState() {
      start()
    }

    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", onPopState)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("popstate", onPopState)
    }
  }, [start])

  useEffect(() => clearTimers, [clearTimers])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1"
    >
      <div
        className="h-full rounded-r-full transition-[width] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background:
            "linear-gradient(90deg, oklch(0.72 0.19 200), oklch(0.62 0.24 265), oklch(0.65 0.28 330))",
          boxShadow: "0 0 14px oklch(0.65 0.28 330 / 0.9), 0 0 6px oklch(0.62 0.24 265 / 0.9)",
        }}
      />
    </div>
  )
}

export function TopLoader() {
  return <TopLoaderInner />
}
