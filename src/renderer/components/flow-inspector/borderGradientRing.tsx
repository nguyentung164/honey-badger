'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * Inject CSS once:
 *   @keyframes rf-rainbow-rotate  — spins the inner conic-gradient div
 *   .rf-rainbow-mask               — clips an element to its padding-wide border strip
 */
let _radiusPx: number | null = null

/** Tailwind `rounded-lg` radius in px — matches node card corners. */
export function themeRadiusPx(): number {
  if (_radiusPx != null) return _radiusPx
  if (typeof document === 'undefined') {
    _radiusPx = 8
    return 8
  }
  const root = document.documentElement
  const raw = getComputedStyle(root).getPropertyValue('--radius').trim()
  if (!raw) {
    _radiusPx = 8
    return 8
  }
  if (raw.endsWith('rem')) {
    const rem = parseFloat(raw)
    const basePx = parseFloat(getComputedStyle(root).fontSize)
    _radiusPx = Number.isFinite(rem) && Number.isFinite(basePx) ? rem * basePx : 8
  } else {
    _radiusPx = parseFloat(raw) || 8
  }
  return _radiusPx
}

let _rbwInjected = false

export function ensureRainbowStyle(): void {
  if (_rbwInjected || typeof document === 'undefined') return
  _rbwInjected = true
  const el = document.createElement('style')
  el.textContent =
    '@keyframes rf-rainbow-rotate{' +
    'from{transform:translate(-50%,-50%) rotate(0deg)}' +
    'to{transform:translate(-50%,-50%) rotate(360deg)}' +
    '}' +
    '@keyframes rf-aurora-breathe{0%,100%{opacity:.4}50%{opacity:.85}}' +
    '@keyframes rf-focus-pulse{0%,100%{opacity:.35}50%{opacity:1}}' +
    '.rf-rainbow-mask{' +
    '-webkit-mask-image:linear-gradient(white,white),linear-gradient(white,white);' +
    '-webkit-mask-clip:content-box,border-box;' +
    '-webkit-mask-composite:destination-out;' +
    'mask-image:linear-gradient(white,white),linear-gradient(white,white);' +
    'mask-clip:content-box,border-box;' +
    'mask-composite:exclude' +
    '}'
  document.head.appendChild(el)
}

/** Clips a spinning conic gradient to a border strip (works with semi-transparent fills). */
export function BorderGradientRing({
  bw,
  rx,
  children,
  outerStyle,
}: {
  bw: number
  rx: number
  children: ReactNode
  outerStyle?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className="rf-rainbow-mask"
      style={{
        position: 'absolute',
        inset: -(bw / 2),
        pointerEvents: 'none',
        zIndex: 20,
        borderRadius: rx + bw / 2,
        overflow: 'hidden',
        padding: bw,
        ...outerStyle,
      }}
    >
      {children}
    </div>
  )
}

export function SpinningGrad({
  gradient,
  dur,
  ccw,
  delay,
}: {
  gradient: string
  dur: string
  ccw?: boolean
  delay?: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        minWidth: '400%',
        minHeight: '400%',
        aspectRatio: '1',
        background: gradient,
        animationName: 'rf-rainbow-rotate',
        animationDuration: dur,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        animationDirection: ccw ? 'reverse' : 'normal',
        ...(delay != null ? { animationDelay: `-${delay}s` } : {}),
      }}
    />
  )
}
