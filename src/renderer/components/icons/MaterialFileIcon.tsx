'use client'

import { memo, useMemo } from 'react'
import { getMaterialIconUrl, resolveMaterialFileIconName, resolveMaterialFolderIconName } from '@/lib/materialIcons/materialIconUrls'
import { cn } from '@/lib/utils'

export type MaterialFileIconProps = {
  /** File path, file name, or folder name used for icon resolution. */
  name: string
  kind?: 'file' | 'folder'
  expanded?: boolean
  size?: number
  className?: string
}

export const MaterialFileIcon = memo(function MaterialFileIcon({ name, kind = 'file', expanded = false, size = 14, className }: MaterialFileIconProps) {
  const iconName = useMemo(() => {
    if (kind === 'folder') return resolveMaterialFolderIconName(name, expanded)
    return resolveMaterialFileIconName(name)
  }, [kind, name, expanded])

  const src = useMemo(() => getMaterialIconUrl(iconName), [iconName])

  if (!src) return null

  return <img src={src} alt="" aria-hidden draggable={false} width={size} height={size} className={cn('shrink-0 object-contain', className)} />
})
