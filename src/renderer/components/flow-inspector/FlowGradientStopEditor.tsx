'use client'

import { memo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GradientStop } from 'shared/flowDiagramStyle'
import {
  ACCENT_GRADIENT_TEMPLATES,
  gradientStopsMatch,
  gradientToCss,
  isMultiColorGradient,
  type AccentGradientTemplateId,
} from 'shared/flowDiagramStyle'
import { formatFlowColor, parseFlowColor } from 'shared/flowColor'
import { cn } from '@/lib/utils'
import { FlowColorPickerPopover } from '@/components/flow-inspector/FlowColorPickerPopover'

// ── Gradient stop editor helpers ─────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const c = parseFlowColor(hex)
  return [c.r, c.g, c.b]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return formatFlowColor({ r, g, b, a: 1 })
}

/** Linearly interpolate the gradient color at position 0–100. */
export function interpolateAt(stops: GradientStop[], pos: number): string {
  if (!stops.length) return '#94a3b8'
  const s = [...stops].sort((a, b) => a.position - b.position)
  if (pos <= s[0].position) return s[0].color
  if (pos >= s[s.length - 1].position) return s[s.length - 1].color
  const hi = s.findIndex(st => st.position > pos)
  const lo = s[hi - 1], h = s[hi]
  const t = (pos - lo.position) / (h.position - lo.position)
  const loC = parseFlowColor(lo.color)
  const hiC = parseFlowColor(h.color)
  return formatFlowColor({
    r: loC.r + (hiC.r - loC.r) * t,
    g: loC.g + (hiC.g - loC.g) * t,
    b: loC.b + (hiC.b - loC.b) * t,
    a: loC.a + (hiC.a - loC.a) * t,
  })
}

// ── GradientStopEditor component ─────────────────────────────────────────

export function GradientStopEditor({ stops, onChange }: { stops: GradientStop[]; onChange: (s: GradientStop[]) => void }) {
  const { t } = useTranslation()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ idx: number; startX: number; startPos: number } | null>(null)

  const gradCss = stops.length < 2
    ? stops[0]?.color ?? '#94a3b8'
    : `linear-gradient(to right, ${stops.map(s => `${s.color} ${s.position}%`).join(', ')})`

  const emit = (next: GradientStop[]) => onChange([...next].sort((a, b) => a.position - b.position))

  const addStop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging.current !== null || !barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const pos = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
    if (stops.some(s => Math.abs(s.position - pos) <= 3)) return
    const color = interpolateAt(stops, pos)
    const newStops = [...stops, { color, position: pos }].sort((a, b) => a.position - b.position)
    emit(newStops)
    setSelectedIdx(newStops.findIndex(s => s.color === color && s.position === pos))
  }

  const startDrag = (e: React.PointerEvent<HTMLElement>, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = { idx, startX: e.clientX, startPos: stops[idx].position }
    setSelectedIdx(idx)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: React.PointerEvent<HTMLElement>, idx: number) => {
    if (!dragging.current || dragging.current.idx !== idx || !barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const delta = ((e.clientX - dragging.current.startX) / rect.width) * 100
    const newPos = Math.max(0, Math.min(100, Math.round(dragging.current.startPos + delta)))
    onChange(stops.map((s, i) => (i === idx ? { ...s, position: newPos } : s)))
  }

  const endDrag = (idx: number) => {
    if (!dragging.current) return
    const col = stops[idx].color
    const pos = stops[idx].position
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    const newIdx = sorted.findIndex(s => s.color === col && s.position === pos)
    setSelectedIdx(newIdx !== -1 ? newIdx : null)
    dragging.current = null
    onChange(sorted)
  }

  const commitColor = (idx: number, color: string) => {
    emit(stops.map((s, i) => (i === idx ? { ...s, color } : s)))
  }

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return
    const next = stops.filter((_, i) => i !== idx)
    emit(next)
    setSelectedIdx(null)
  }

  const selectedStop = selectedIdx !== null ? stops[selectedIdx] : null

  return (
    <div className="space-y-1.5">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: gradient bar is a visual editing tool; keyboard users interact via the handle buttons */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: gradient bar allows click-to-add-stop on non-interactive background */}
      <div className="relative h-8 select-none" onClick={addStop}>
        <div
          ref={barRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-2.5 rounded-md"
          style={{ background: gradCss }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-[1] h-2.5 rounded-md bg-[repeating-conic-gradient(#808080_0%_25%,transparent_0%_50%)] bg-[length:8px_8px]" />
        {stops.map((stop, idx) => (
          <button
            type="button"
            key={idx}
            aria-label={`Color stop at ${stop.position}%`}
            className={cn(
              'absolute top-[5px] size-[14px] -translate-x-1/2 cursor-grab rounded-sm border-2 border-white p-0 shadow transition-shadow active:cursor-grabbing',
              selectedIdx === idx && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
            style={{ left: `${stop.position}%`, background: stop.color }}
            onPointerDown={e => startDrag(e, idx)}
            onPointerMove={e => onDragMove(e, idx)}
            onPointerUp={() => endDrag(idx)}
            onClick={e => {
              e.stopPropagation()
              setSelectedIdx(idx)
            }}
          />
        ))}
      </div>

      {selectedStop && selectedIdx !== null && (
        <div className="flex items-center gap-2">
          <FlowColorPickerPopover
            value={selectedStop.color}
            onCommit={hex => commitColor(selectedIdx, hex)}
            variant="ring"
            swatchClassName="size-6"
            ariaLabel={t('flowInspector.customColor')}
          />
          <span className="text-[10px] tabular-nums text-muted-foreground">{selectedStop.position}%</span>
          <span className="text-[10px] font-mono text-muted-foreground">{selectedStop.color}</span>
          {stops.length > 2 && (
            <button
              type="button"
              className="ml-auto text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => removeStop(selectedIdx)}
            >
              {t('flowInspector.accentStopRemove')}
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/60">{t('flowInspector.accentClickToAdd')}</p>
    </div>
  )
}

// ── Gradient template presets grid ───────────────────────────────────────

export const GRADIENT_TPL_I18N: Record<AccentGradientTemplateId, string> = {
  aurora: 'accentTplAurora',
  sunset: 'accentTplSunset',
  ocean: 'accentTplOcean',
  synth: 'accentTplSynth',
  lime: 'accentTplLime',
  peach: 'accentTplPeach',
  cosmos: 'accentTplCosmos',
  holographic: 'accentTplHolographic',
  golden: 'accentTplGolden',
  roseGold: 'accentTplRoseGold',
}

type GradientPresetsGridProps = {
  activeStops: GradientStop[]
  onPickTemplate: (stops: GradientStop[]) => void
}

export const GradientPresetsGrid = memo(function GradientPresetsGrid({ activeStops, onPickTemplate }: GradientPresetsGridProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ACCENT_GRADIENT_TEMPLATES.map(tpl => {
        const active = isMultiColorGradient(activeStops) && gradientStopsMatch(activeStops, tpl.stops)
        return (
          <button
            key={tpl.id}
            type="button"
            className={cn(
              'h-7 w-full overflow-hidden rounded-md p-0 shadow-sm ring-1 ring-inset ring-border/50 transition-all hover:scale-[1.03] hover:shadow-md',
              active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
            title={t(`flowInspector.${GRADIENT_TPL_I18N[tpl.id]}`)}
            aria-label={t(`flowInspector.${GRADIENT_TPL_I18N[tpl.id]}`)}
            onClick={() => onPickTemplate(tpl.stops)}
          >
            <span
              className="block h-full w-full"
              style={{ background: gradientToCss(tpl.stops) }}
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
})
