import type { LucideIcon } from 'lucide-react'
import { Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesSettingsSearch } from '@/components/settings/settingsSearch'
import { AccordionContent, AccordionItem, AccordionTrigger, Accordion as UiAccordion } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Large settings shell — shared by editor & terminal dialogs. */
export const SETTINGS_DIALOG_CONTENT_CLASS = 'flex h-[min(94vh,58rem)] w-[min(100%-1.25rem,72rem)] max-w-[72rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[72rem]'

export const SETTINGS_DIALOG_HEADER_CLASS = 'shrink-0 space-y-0 px-4 py-2 text-left'

export const SETTINGS_DIALOG_FOOTER_CLASS = 'shrink-0 border-t border-border/50 bg-muted/10 px-5 py-2.5'

/** Settings dialog typography — each step is +1px vs the prior compact scale. */
export const SETTINGS_FONT_TITLE = 'text-[15px]'
export const SETTINGS_FONT_CONTROL = 'text-[13px]'
export const SETTINGS_FONT_LABEL = 'text-[12px]'
export const SETTINGS_FONT_CAPTION = 'text-[11px]'
export const SETTINGS_FONT_MICRO = 'text-[10px]'
export const SETTINGS_FONT_NANO = 'text-[9px]'

export const SETTINGS_ACCORDION_TRIGGER_CLASS = 'hover:no-underline px-2.5 py-2 items-center [&>svg:last-child]:size-3.5 data-[state=open]:bg-muted/20'

export const SETTINGS_ACCORDION_CLASS = 'flex w-full flex-col gap-2'

export const SETTINGS_ACCORDION_ITEM_CLASS = 'overflow-hidden rounded-lg border border-border/55 bg-muted/12 shadow-sm last:border-b hover:bg-muted/16'

export const SETTINGS_ACCORDION_CONTENT_CLASS = 'space-y-2 px-2.5 pb-2.5 pt-0'

export const SETTINGS_PANEL_SCROLL_CLASS = 'bg-muted/6'

export const SETTINGS_CONTROL_CLASS = 'h-8 text-[13px]'

export const SETTINGS_PREVIEW_PANEL_CLASS = 'flex h-full min-h-0 flex-col bg-muted/5 px-4 py-2 pr-0'

export const SETTINGS_PREVIEW_MIN_HEIGHT = 'min-h-0 flex-1'

/** react-resizable-panels v4: numeric size = px; use explicit % strings for layout. */
export const SETTINGS_PREVIEW_PANEL_DEFAULT_SIZE = '40%'
export const SETTINGS_PREVIEW_PANEL_MIN_SIZE = '28%'
export const SETTINGS_PREVIEW_PANEL_MAX_SIZE = '58%'
export const SETTINGS_CONTENT_PANEL_DEFAULT_SIZE = '60%'
export const SETTINGS_CONTENT_PANEL_MIN_SIZE = '42%'

export const SETTINGS_RESIZE_HANDLE_CLASS = 'bg-transparent after:w-2'

const SettingsSearchQueryContext = createContext('')

const SettingsSectionShowAllContext = createContext(false)

export function useSettingsSearchQuery(): string {
  return useContext(SettingsSearchQueryContext)
}

export function SettingsSearchProvider({ query, children }: { query: string; children: ReactNode }) {
  return <SettingsSearchQueryContext.Provider value={query}>{children}</SettingsSearchQueryContext.Provider>
}

type SettingsDialogFrameProps = {
  title: string
  description: string
  footer: ReactNode
  children: ReactNode
  showCloseButton?: boolean
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  searchPlaceholder?: string
}

export function SettingsDialogFrame({
  title,
  description,
  footer,
  children,
  showCloseButton = true,
  searchQuery = '',
  onSearchQueryChange,
  searchPlaceholder,
}: SettingsDialogFrameProps) {
  const { t } = useTranslation()
  const showSearch = typeof onSearchQueryChange === 'function'

  return (
    <DialogContent
      className={SETTINGS_DIALOG_CONTENT_CLASS}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      showCloseButton={showCloseButton}
      onOpenAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => event.preventDefault()}
      onPointerDownOutside={event => event.preventDefault()}
    >
      <DialogHeader className={cn(SETTINGS_DIALOG_HEADER_CLASS, showSearch && 'space-y-2')}>
        <div className="space-y-0">
          <DialogTitle className={cn(SETTINGS_FONT_TITLE, 'font-semibold leading-tight')}>{title}</DialogTitle>
          <DialogDescription className={cn(SETTINGS_FONT_LABEL, 'leading-snug text-muted-foreground')}>{description}</DialogDescription>
        </div>
        {showSearch ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              role="searchbox"
              value={searchQuery}
              onChange={event => onSearchQueryChange(event.target.value)}
              placeholder={searchPlaceholder}
              className={cn(SETTINGS_CONTROL_CLASS, 'pr-8 pl-8')}
              aria-label={searchPlaceholder}
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => onSearchQueryChange('')}
                aria-label={t('settingsDialog.clearSearch')}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </DialogHeader>
      {children}
      <DialogFooter className={cn(SETTINGS_DIALOG_FOOTER_CLASS, 'sm:justify-between')}>{footer}</DialogFooter>
    </DialogContent>
  )
}

type SettingsDialogSplitLayoutProps = {
  preview: ReactNode
  previewPanelId?: string
  contentPanelId?: string
  children: ReactNode
}

/** Resizable preview (left) + scrollable settings (right). */
export function SettingsDialogSplitLayout({
  preview,
  previewPanelId = 'settings-dialog-preview',
  contentPanelId = 'settings-dialog-content',
  children,
}: SettingsDialogSplitLayoutProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        id={previewPanelId}
        defaultSize={SETTINGS_PREVIEW_PANEL_DEFAULT_SIZE}
        minSize={SETTINGS_PREVIEW_PANEL_MIN_SIZE}
        maxSize={SETTINGS_PREVIEW_PANEL_MAX_SIZE}
        className="min-h-0 min-w-0"
      >
        <aside className={SETTINGS_PREVIEW_PANEL_CLASS}>
          <div className={cn('flex min-h-0 flex-col', SETTINGS_PREVIEW_MIN_HEIGHT)}>{preview}</div>
        </aside>
      </ResizablePanel>
      <ResizableHandle showGrip={false} className={SETTINGS_RESIZE_HANDLE_CLASS} />
      <ResizablePanel id={contentPanelId} defaultSize={SETTINGS_CONTENT_PANEL_DEFAULT_SIZE} minSize={SETTINGS_CONTENT_PANEL_MIN_SIZE} className="min-h-0 min-w-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">{children}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

type SettingsTabPanelProps = {
  children: ReactNode
}

/** Scrollable settings column. */
export function SettingsTabPanel({ children }: SettingsTabPanelProps) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto', SETTINGS_PANEL_SCROLL_CLASS)}>
      <div className="px-2 py-2">
        <SettingsSearchResultsGuard>{children}</SettingsSearchResultsGuard>
      </div>
    </div>
  )
}

function SettingsSearchResultsGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const query = useSettingsSearchQuery()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasResults, setHasResults] = useState(true)

  useLayoutEffect(() => {
    if (!query.trim()) {
      setHasResults(true)
      return
    }
    const count = containerRef.current?.querySelectorAll('[data-settings-accordion-item]').length ?? 0
    setHasResults(count > 0)
  }, [query, children])

  return (
    <>
      <div ref={containerRef}>{children}</div>
      {query.trim() && !hasResults ? <p className={cn('py-8 text-center text-muted-foreground', SETTINGS_FONT_LABEL)}>{t('settingsDialog.noResults')}</p> : null}
    </>
  )
}

export const SETTINGS_ACCORDION_TITLE_CLASS = 'font-semibold uppercase tracking-wide leading-tight'

export const SETTINGS_ACCORDION_ICON_CLASS = 'size-3.5 shrink-0 text-muted-foreground'

function collectAccordionItemValues(children: ReactNode): string[] {
  const values: string[] = []
  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    const props = child.props as { value?: string; children?: ReactNode }
    if (typeof props.value === 'string') values.push(props.value)
    if (props.children) values.push(...collectAccordionItemValues(props.children))
  })
  return values
}

type SettingsAccordionProps = {
  className?: string
  defaultValue?: string[]
  value?: string[]
  onValueChange?: (value: string[]) => void
  children: ReactNode
}

export function SettingsAccordion({ className, defaultValue, value, onValueChange, children }: SettingsAccordionProps) {
  const query = useSettingsSearchQuery()
  const resolvedDefaultValue = useMemo(() => {
    if (defaultValue !== undefined) return defaultValue
    if (value !== undefined) return undefined
    const all = collectAccordionItemValues(children)
    return all.length > 0 ? all : undefined
  }, [children, defaultValue, value])

  const searchOpenValues = useMemo(() => {
    if (!query.trim()) return undefined
    return collectAccordionItemValues(children)
  }, [children, query])

  return (
    <UiAccordion
      type="multiple"
      defaultValue={searchOpenValues ? undefined : resolvedDefaultValue}
      value={searchOpenValues ?? value}
      onValueChange={onValueChange}
      className={cn(SETTINGS_ACCORDION_CLASS, className)}
    >
      {children}
    </UiAccordion>
  )
}

function SettingsSectionContent({
  children,
  sectionMatches,
  onVisibilityChange,
}: {
  children: ReactNode
  sectionMatches: boolean
  onVisibilityChange: (hasVisibleFields: boolean) => void
}) {
  const query = useSettingsSearchQuery()
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!query.trim()) {
      onVisibilityChange(true)
      return
    }
    const container = containerRef.current
    if (!container) return
    const hasVisibleFields = Array.from(container.children).some(child => (child as HTMLElement).offsetHeight > 0)
    onVisibilityChange(hasVisibleFields)
  }, [query, children, onVisibilityChange])

  return (
    <SettingsSectionShowAllContext.Provider value={sectionMatches}>
      <div ref={containerRef} className={SETTINGS_ACCORDION_CONTENT_CLASS}>
        {children}
      </div>
    </SettingsSectionShowAllContext.Provider>
  )
}

export function SettingsAccordionSection({
  value,
  title,
  description,
  icon: Icon,
  children,
}: {
  value: string
  title: string
  description?: string
  icon?: LucideIcon
  children: ReactNode
}) {
  const query = useSettingsSearchQuery()
  const sectionMatches = matchesSettingsSearch(query, title, description)
  const [hasVisibleFields, setHasVisibleFields] = useState(true)
  const onVisibilityChange = useCallback((visible: boolean) => {
    setHasVisibleFields(visible)
  }, [])

  useEffect(() => {
    if (!query.trim()) setHasVisibleFields(true)
  }, [query])

  const visible = !query.trim() || sectionMatches || hasVisibleFields
  if (!visible) return null

  return (
    <AccordionItem value={value} data-settings-accordion-item className={cn('border-0', SETTINGS_ACCORDION_ITEM_CLASS)}>
      <AccordionTrigger className={SETTINGS_ACCORDION_TRIGGER_CLASS}>
        <span className="flex min-w-0 flex-col items-start gap-0 text-left">
          <span className="flex min-w-0 items-center gap-1.5">
            {Icon ? <Icon className={SETTINGS_ACCORDION_ICON_CLASS} aria-hidden /> : null}
            <span className={cn(SETTINGS_ACCORDION_TITLE_CLASS, SETTINGS_FONT_CAPTION)}>{title}</span>
          </span>
          {description ? <span className={cn(SETTINGS_FONT_CAPTION, 'font-normal leading-snug text-muted-foreground', Icon && 'pl-5')}>{description}</span> : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <SettingsSectionContent sectionMatches={sectionMatches} onVisibilityChange={onVisibilityChange}>
          {children}
        </SettingsSectionContent>
      </AccordionContent>
    </AccordionItem>
  )
}

export function SettingsFieldBlock({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  const query = useSettingsSearchQuery()
  const sectionShowsAll = useContext(SettingsSectionShowAllContext)
  const fieldMatches = matchesSettingsSearch(query, label, hint)
  if (query.trim() && !sectionShowsAll && !fieldMatches) return null

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} className={cn(SETTINGS_FONT_LABEL, 'font-medium leading-none text-foreground/90')}>
        {label}
      </Label>
      {children}
      {hint ? <p className={cn(SETTINGS_FONT_CAPTION, 'leading-snug text-muted-foreground')}>{hint}</p> : null}
    </div>
  )
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  id,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id: string
}) {
  const query = useSettingsSearchQuery()
  const sectionShowsAll = useContext(SettingsSectionShowAllContext)
  const fieldMatches = matchesSettingsSearch(query, label, description)
  if (query.trim() && !sectionShowsAll && !fieldMatches) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 transition-colors hover:bg-background/90">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className={cn('block font-medium leading-tight', SETTINGS_FONT_LABEL)}>{label}</span>
        {description ? <p className={cn('mt-0.5 leading-snug text-muted-foreground', SETTINGS_FONT_CAPTION)}>{description}</p> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 scale-90" />
    </div>
  )
}

export function SettingsValueBadge({ children }: { children: ReactNode }) {
  return <span className={cn('w-9 shrink-0 text-right font-medium tabular-nums text-muted-foreground', SETTINGS_FONT_LABEL)}>{children}</span>
}

export const SETTINGS_PREVIEW_HINT_CHIP_CLASS = cn(
  'rounded-md border-transparent bg-foreground/[0.06] px-1.5 py-0 font-normal text-muted-foreground/85 shadow-none',
  SETTINGS_FONT_MICRO
)

type SettingsPreviewHintChipsProps = {
  hints: string[]
  className?: string
  style?: React.CSSProperties
  /** Chips only — no footer border/background (e.g. inline in a status bar). */
  bare?: boolean
}

export function SettingsPreviewHintChips({ hints, className, style, bare = false }: SettingsPreviewHintChipsProps) {
  if (hints.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', !bare && 'shrink-0 border-t border-border/50 bg-muted/8 px-2.5 py-1.5', className)} style={style}>
      {hints.map((hint, index) => (
        <Badge key={`${hint}-${index}`} variant="outline" className={SETTINGS_PREVIEW_HINT_CHIP_CLASS}>
          {hint}
        </Badge>
      ))}
    </div>
  )
}
