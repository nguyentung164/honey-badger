import type { CSSProperties } from 'react'

export type FrameShape = 'circle' | 'shield' | 'pentagon' | 'hexagon'

export type LayerLayout = {
  left: string
  top: string
  width: string
  height: string
  inset?: string
  blendMode?: CSSProperties['mixBlendMode']
}

export type FrameLayout = {
  base: LayerLayout
  inner: LayerLayout
  highlight: LayerLayout
}

/** Layer positions ported from Figma "Design Wizard Badges" (220×220 artboard). */
export const FRAME_LAYOUTS: Record<FrameShape, FrameLayout> = {
  circle: {
    base: { left: '16.67%', top: '16.67%', width: '66.67%', height: '66.67%' },
    inner: { left: '28.33%', top: '28.33%', width: '43.33%', height: '43.33%', inset: '-9.62%' },
    highlight: { left: '24.17%', top: '24.17%', width: '51.67%', height: '51.67%', inset: '-0.81%', blendMode: 'overlay' },
  },
  shield: {
    base: { left: '18.33%', top: '18.75%', width: '63.33%', height: '66.67%', inset: '0 0 0.99% 0' },
    inner: { left: '27.92%', top: '27.5%', width: '44.17%', height: '47.08%', inset: '-7.08% -7.55% -6.3% -7.55%' },
    highlight: { left: '24.58%', top: '24.17%', width: '50.83%', height: '54.38%', inset: '-0.77% -0.82% 1.01% -0.82%' },
  },
  pentagon: {
    base: { left: '12.92%', top: '10.61%', width: '74.17%', height: '70.46%', inset: '1.55% 1.1% 0 1.1%' },
    inner: { left: '24.51%', top: '23.12%', width: '51%', height: '48.21%', inset: '-6.53% -6.47% -7.69% -6.47%' },
    highlight: { left: '20.33%', top: '18.49%', width: '59.33%', height: '56.55%', inset: '1.79% 0.99% -0.82% 0.99%' },
  },
  hexagon: {
    base: { left: '17.5%', top: '12.57%', width: '64.17%', height: '74.86%', inset: '0.94% 0' },
    inner: { left: '28.64%', top: '25.49%', width: '41.89%', height: '49.02%', inset: '-6.55% -8.51%' },
    highlight: { left: '25.08%', top: '21.48%', width: '49.02%', height: '57.04%', inset: '0.81% -0.91%' },
  },
}

export const TIER_TO_SHAPE: Record<string, FrameShape> = {
  bronze: 'circle',
  negative: 'circle',
  silver: 'shield',
  gold: 'pentagon',
  special: 'hexagon',
}
