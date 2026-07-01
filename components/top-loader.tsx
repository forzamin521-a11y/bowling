"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * 페이지 이동 시 화면 상단에 표시되는 진행바 (GitHub/YouTube 스타일).
 *
 * 동작 방식:
 * - 내부 링크(<a>) 클릭 또는 history 조작(뒤로/앞으로, router.push)을 감지해 시작
 * - 실제 라우트(pathname/searchParams)가 바뀌면 100%까지 채우고 사라짐
 * - 네비게이션이 취소돼도 안전 타임아웃으로 자동 정리
 *
 * Suspense 경계 안에서 렌더해야 한다(useSearchParams 요구사항).
 */
function TopLoaderInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRoute = useRef(false)

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

  const start = useCallback(() => {
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
    safetyRef.current = setTimeout(() => done(), 10000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers])

  const done = useCallback(() => {
    clearTimers()
    setProgress(100)
    hideRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 250)
  }, [clearTimers])

  // 라우트가 실제로 바뀌면 완료 처리 (최초 마운트는 건너뜀)
  useEffect(() => {
    if (!mountedRoute.current) {
      mountedRoute.current = true
      return
    }
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  // 링크 클릭 감지 → 시작
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
      // 동일 URL이거나 해시 이동만인 경우 제외
      if (url.href === window.location.href) return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return
      }
      start()
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [start])

  // 뒤로/앞으로 및 router.push 등 history 조작 감지 → 시작
  useEffect(() => {
    function onPopState() {
      start()
    }
    window.addEventListener("popstate", onPopState)

    const origPush = window.history.pushState
    const origReplace = window.history.replaceState
    window.history.pushState = function (...args) {
      start()
      return origPush.apply(this, args as Parameters<typeof origPush>)
    }
    window.history.replaceState = function (...args) {
      return origReplace.apply(this, args as Parameters<typeof origReplace>)
    }

    return () => {
      window.removeEventListener("popstate", onPopState)
      window.history.pushState = origPush
      window.history.replaceState = origReplace
    }
  }, [start])

  useEffect(() => clearTimers, [clearTimers])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5"
    >
      <div
        className="h-full rounded-r-full bg-primary transition-[width] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow:
            "0 0 10px var(--primary), 0 0 5px var(--primary)",
        }}
      />
    </div>
  )
}

export function TopLoader() {
  return <TopLoaderInner />
}
