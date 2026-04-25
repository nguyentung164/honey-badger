'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { GlowLoader } from './GlowLoader'

type OverlayLoaderProps = {
  isLoading: boolean
  size?: number
  delayMs?: number
}

export function OverlayLoader({ isLoading, size = 50, delayMs = 400 }: OverlayLoaderProps) {
  const [shouldRender, setShouldRender] = useState(isLoading)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (!isLoading) {
      timeout = setTimeout(() => setShouldRender(false), delayMs)
    } else {
      setShouldRender(true)
    }
    return () => clearTimeout(timeout)
  }, [isLoading, delayMs])

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          key="overlay-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="grounded-radiants absolute inset-0 z-50 bg-transparent backdrop-blur-lg flex flex-col items-center justify-center h-full"
        >
          <div style={{ width: size, height: size }}>
            <GlowLoader className="w-full h-full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
