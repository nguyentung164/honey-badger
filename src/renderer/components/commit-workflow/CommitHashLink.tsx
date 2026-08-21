'use client'

import { cn } from '@/lib/utils'

export function CommitHashLink({
  label,
  hash,
  webUrl,
  className,
  onOpen,
}: {
  label?: string
  hash: string
  webUrl?: string | null
  className?: string
  onOpen?: () => void | Promise<void>
}) {
  const display = label ?? hash.slice(0, 7)
  const canOpen = Boolean(webUrl || onOpen)

  if (!canOpen) {
    return <span className={cn('font-mono', className)}>{display}</span>
  }

  return (
    <button
      type="button"
      className={cn(
        'font-mono text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded cursor-pointer',
        className
      )}
      title={webUrl ?? undefined}
      onClick={e => {
        e.stopPropagation()
        if (onOpen) {
          void onOpen()
          return
        }
        if (webUrl) void window.api.system.open_external_url(webUrl)
      }}
    >
      {display}
    </button>
  )
}
