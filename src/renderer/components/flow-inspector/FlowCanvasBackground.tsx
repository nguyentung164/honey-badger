'use client'

import { Background } from '@xyflow/react'
import { memo } from 'react'

/** Shared dot grid — colors come from `flowCanvasTheme.css` tokens. */
export const FlowCanvasBackground = memo(function FlowCanvasBackground() {
  return <Background gap={20} size={1} />
})
