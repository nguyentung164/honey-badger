import type { CSSProperties } from 'react'
import type { FlowNodeHandleStyleKind } from 'shared/flowDiagramStyle'
import { cn } from '@/lib/utils'

/**
 * Compact “magnet” visuals for React Flow handles — understated, diagram-friendly,
 * avoids heavy outlines/glow in the defaults.
 */
export function getFlowNodeHandleLook(kind: FlowNodeHandleStyleKind | undefined, accentColor: string | undefined) {
  const accent = accentColor?.trim() || '#64748b'

  switch (kind) {
    case 'accent-ring':
      return {
        className:
          'box-border shrink-0 !size-[7px] rounded-full border-[1.5px] border-background bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]',
        style: { borderColor: `color-mix(in oklab, ${accent} 72%, var(--border))` } satisfies CSSProperties,
        sizePx: 7,
      }
    case 'accent-glow':
      return {
        className: 'box-border shrink-0 !size-[6px] rounded-full border border-background/90 bg-muted-foreground/25 dark:bg-background/75',
        style: {
          boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 28%, transparent)`,
        } satisfies CSSProperties,
        sizePx: 6,
      }
    default:
      return {
        className:
          'box-border shrink-0 !size-[6px] rounded-full border border-background/95 bg-muted-foreground/70 shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:bg-muted-foreground/65',
        style: undefined,
        sizePx: 6,
      }
  }
}

/** Shared class + inline size for preview dots and React Flow `<Handle>` (overrides RF defaults). */
export function getFlowNodeHandleRfProps(kind: FlowNodeHandleStyleKind | undefined, accentColor: string | undefined) {
  const look = getFlowNodeHandleLook(kind, accentColor)
  const px = look.sizePx
  return {
    className: cn(
      look.className,
      '!outline-none transition-transform',
      // React Flow ships default handle bg/border/size — force our look through.
      '!border-solid',
    ),
    style: {
      ...look.style,
      width: px,
      height: px,
      minWidth: px,
      minHeight: px,
    } satisfies CSSProperties,
  }
}
