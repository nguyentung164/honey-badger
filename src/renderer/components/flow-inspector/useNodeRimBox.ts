'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { NodeRimBox } from '@/components/flow-inspector/nodeRimGeometry'

function readLayoutBox(el: HTMLElement): NodeRimBox {
  return { w: el.offsetWidth, h: el.offsetHeight }
}

/** Layout px from frame ref — avoids getBoundingClientRect (React Flow zoom skews that). */
export function useNodeRimBox(measureRef: RefObject<HTMLElement | null>): NodeRimBox {
  const [box, setBox] = useState<NodeRimBox>({ w: 0, h: 0 })

  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const measure = () => {
      const next = readLayoutBox(el)
      setBox(prev => (prev.w === next.w && prev.h === next.h ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measureRef])

  return box
}
