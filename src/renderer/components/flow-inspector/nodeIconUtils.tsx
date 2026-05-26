'use client'

import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import {
  Activity,
  AlertCircle,
  BarChart2,
  Bell,
  Bookmark,
  CheckCircle2,
  Clock,
  Code,
  Cpu,
  Database,
  Eye,
  FileText,
  GitBranch,
  Globe,
  Heart,
  Home,
  Layers,
  Link,
  Lock,
  Mail,
  Megaphone,
  Package,
  Pencil,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Tag,
  User,
  Zap,
} from 'lucide-react'
import type { CSSProperties, ReactElement } from 'react'
import { memo, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/** Five quick Lucide presets for flows (inspector + previews). */
export const FLOW_NODE_ICON_QUICK_KEYS = ['Globe', 'Cpu', 'Layers', 'Database', 'Zap'] as const

/** Preset Lucide icons bundled for sync rendering (popular keys still used elsewhere). */
export const NODE_ICON_PRESETS: Record<string, LucideIcon> = {
  Globe,
  Code,
  FileText,
  Settings,
  User,
  Star,
  Zap,
  ShieldCheck,
  Database,
  Layers,
  BarChart2,
  Mail,
  Bell,
  Home,
  Search,
  Tag,
  Package,
  Cpu,
  Link,
  Lock,
  Eye,
  Heart,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Pencil,
  Megaphone,
  Activity,
  GitBranch,
}

export const NODE_ICON_PRESET_KEYS = Object.keys(NODE_ICON_PRESETS)

/** Kebab-case Lucide slug (e.g. `arrow-down-circle`) → export name (`ArrowDownCircle`). */
export function lucideSlugToExportName(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
    .join('')
}

/** PascalCase export name (`ArrowDownCircle`) → kebab slug for `dynamicIconImports`. */
export function lucideExportNameToSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function slugInDynamicImports(slug: string): boolean {
  return slug in dynamicIconImports
}

/**
 * Render a node icon from its stored key (sync presets + inline images).
 * Use {@link FlowNodeDiagramIcon} for any arbitrary Lucide name loaded from the picker.
 */
export function renderNodeIcon(iconKey: string | undefined, opts: { className?: string; style?: CSSProperties } = {}): ReactElement | null {
  if (!iconKey) return null
  if (iconKey.startsWith('data:')) {
    return <img src={iconKey} alt="" aria-hidden className={opts.className} style={{ objectFit: 'contain', ...opts.style }} />
  }
  const Icon = NODE_ICON_PRESETS[iconKey]
  if (!Icon) return null
  return <Icon className={opts.className} style={opts.style} aria-hidden />
}

/** Full Lucide picker + presets: resolves dynamic icons asynchronously. */
export const FlowNodeDiagramIcon = memo(function FlowNodeDiagramIcon({
  iconKey,
  className,
  style,
}: {
  iconKey?: string | undefined
  className?: string
  style?: CSSProperties
}) {
  if (!iconKey?.trim()) return null
  const syncEl = renderNodeIcon(iconKey, { className, style })
  if (syncEl != null) return syncEl
  const pascal = iconKey.trim()
  if (pascal.startsWith('data:')) return null

  return <LucideDeferredByName exportName={pascal} className={className} style={style} />
})

function LucideDeferredByName({
  exportName,
  className,
  style,
}: {
  exportName: string
  className?: string
  style?: CSSProperties
}) {
  const [IconCmp, setIconCmp] = useState<LucideIcon | null | false>(false)

  useEffect(() => {
    let cancel = false
    const slug = lucideExportNameToSlug(exportName)
    if (!slug || !slugInDynamicImports(slug)) {
      setIconCmp(null)
      return
    }
    const loader = dynamicIconImports[slug as keyof typeof dynamicIconImports]
    void loader()
      .then(m => {
        if (!cancel) setIconCmp(() => m.default)
      })
      .catch(() => {
        if (!cancel) setIconCmp(null)
      })
    return () => {
      cancel = true
    }
  }, [exportName])

  if (IconCmp === false) {
    return <span className={cn('inline-flex min-h-[1em] min-w-[1em] animate-pulse rounded-sm bg-muted', className)} style={style} aria-hidden />
  }
  if (IconCmp === null) return null
  const Cmp = IconCmp
  return <Cmp className={className} style={style} aria-hidden />
}
