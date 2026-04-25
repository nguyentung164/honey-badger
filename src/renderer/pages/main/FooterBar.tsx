'use client'
import { ProgressBar } from '@/components/ui-elements/ProgressBar'

interface FooterBarProps {
  isLoading: boolean
  progress: number
}

export function FooterBar({ isLoading, progress }: FooterBarProps) {
  return (
    <div className="flex justify-between h-5 items-center px-2 py-1 border-t">
      <div className="w-full">{isLoading ? <ProgressBar value={progress} /> : null}</div>
    </div>
  )
}
