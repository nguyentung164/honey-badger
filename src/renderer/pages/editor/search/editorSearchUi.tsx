'use client'

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FilePlus2,
  FilterX,
  LayoutList,
  ListTree,
  ListX,
  MoreHorizontal,
  RefreshCw,
  Replace,
} from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { buildSearchRegExp } from 'shared/editor/searchReplace'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function EditorSearchToolbar({
  onRefresh,
  onClearResults,
  onNewSearchEditor,
  viewMode,
  onToggleViewMode,
  onCollapseAll,
  disabled,
}: {
  onRefresh: () => void
  onClearResults: () => void
  onNewSearchEditor: () => void
  viewMode: 'list' | 'tree'
  onToggleViewMode: () => void
  onCollapseAll: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  const items = [
    { key: 'refresh', icon: RefreshCw, label: t('editor.searchActions.refresh'), onClick: onRefresh },
    { key: 'clear', icon: ListX, label: t('editor.searchActions.clearResults'), onClick: onClearResults },
    { key: 'newEditor', icon: FilePlus2, label: t('editor.searchActions.newSearchEditor'), onClick: onNewSearchEditor },
    {
      key: 'viewMode',
      icon: viewMode === 'tree' ? LayoutList : ListTree,
      label: viewMode === 'tree' ? t('editor.searchActions.viewAsList') : t('editor.searchActions.viewAsTree'),
      onClick: onToggleViewMode,
    },
    { key: 'collapse', icon: ChevronsDownUp, label: t('editor.searchActions.collapseAll'), onClick: onCollapseAll },
  ] as const

  return (
    <div className="flex h-[26px] shrink-0 items-center justify-end gap-0 px-0.5">
      {items.map(item => {
        const Icon = item.icon
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-[22px] w-[22px] items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label={item.label}
                title={item.label}
                disabled={disabled}
                onClick={item.onClick}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{item.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export function EditorSearchInputToggle({
  label,
  active,
  onToggle,
  title,
  className,
}: {
  label: string
  active: boolean
  onToggle: () => void
  title: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'flex h-[20px] min-w-[20px] items-center justify-center rounded-sm px-0.5 text-[11px] font-medium leading-none text-muted-foreground hover:bg-muted/70',
        active && 'bg-primary/15 text-foreground',
        className
      )}
    >
      {label}
    </button>
  )
}

type EditorSearchQueryInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  showReplace: boolean
  onToggleReplace: () => void
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  onToggleCaseSensitive: () => void
  onToggleWholeWord: () => void
  onToggleRegex: () => void
  showFilters: boolean
  onToggleFilters: () => void
  trailing?: ReactNode
} & Pick<InputHTMLAttributes<HTMLInputElement>, 'onKeyDown'>

export function EditorSearchQueryInput({
  value,
  onChange,
  placeholder,
  showReplace,
  onToggleReplace,
  caseSensitive,
  wholeWord,
  regex,
  onToggleCaseSensitive,
  onToggleWholeWord,
  onToggleRegex,
  showFilters,
  onToggleFilters,
  trailing,
  onKeyDown,
}: EditorSearchQueryInputProps) {
  const { t } = useTranslation()

  return (
    <div className="editor-search-find-input flex min-w-0 items-stretch rounded-sm border border-border/80 bg-background focus-within:border-ring/60">
      <button
        type="button"
        className="flex w-[22px] shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label={t('editor.toggleReplace')}
        aria-expanded={showReplace}
        onClick={onToggleReplace}
      >
        {showReplace ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70"
        spellCheck={false}
      />
      <div className="flex shrink-0 items-center gap-px pr-0.5">
        <EditorSearchInputToggle
          label="Aa"
          active={caseSensitive}
          onToggle={onToggleCaseSensitive}
          title={t('editor.matchCase')}
        />
        <EditorSearchInputToggle
          label="ab"
          active={wholeWord}
          onToggle={onToggleWholeWord}
          title={t('editor.wholeWord')}
          className="underline decoration-1 underline-offset-[2px]"
        />
        <EditorSearchInputToggle label=".*" active={regex} onToggle={onToggleRegex} title={t('editor.useRegex')} />
        <button
          type="button"
          className={cn(
            'flex h-[20px] w-[20px] items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            showFilters && 'bg-muted/60 text-foreground'
          )}
          aria-label={showFilters ? t('editor.searchHideFilters') : t('editor.searchShowFilters')}
          aria-expanded={showFilters}
          onClick={onToggleFilters}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {trailing}
      </div>
    </div>
  )
}

export function EditorSearchReplaceInput({
  value,
  onChange,
  placeholder,
  onReplaceAll,
  replaceAllDisabled,
  isReplacing,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  onReplaceAll: () => void
  replaceAllDisabled: boolean
  isReplacing: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="editor-search-replace-input flex h-[26px] min-w-0 items-center rounded-sm border border-border/80 bg-background focus-within:border-ring/60">
      <div className="flex h-full w-[22px] shrink-0 items-center justify-center text-muted-foreground">
        <Replace className="h-3.5 w-3.5" />
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/70"
        spellCheck={false}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center self-center rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label={t('editor.replaceAll')}
            disabled={replaceAllDisabled || isReplacing}
            onClick={onReplaceAll}
          >
            <Replace className={cn('h-3.5 w-3.5', isReplacing && 'animate-pulse')} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('editor.replaceAll')}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function EditorSearchPatternInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  toggleIcon: ToggleIcon,
  toggleActive,
  onToggle,
  toggleTitle,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  toggleIcon: typeof BookOpen
  toggleActive: boolean
  onToggle: () => void
  toggleTitle: string
}) {
  return (
    <div className="editor-search-pattern-input flex h-[26px] min-w-0 items-center rounded-sm border border-border/70 bg-background focus-within:border-ring/60">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground/70"
        spellCheck={false}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-[22px] w-[22px] shrink-0 items-center justify-center self-center rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              toggleActive && 'text-foreground'
            )}
            aria-label={toggleTitle}
            aria-pressed={toggleActive}
            onClick={onToggle}
          >
            <ToggleIcon className={cn('h-3.5 w-3.5', !toggleActive && 'opacity-45')} strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleTitle}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function EditorSearchMatchHighlight({
  preview,
  query,
  caseSensitive,
  wholeWord,
  regex,
}: {
  preview: string
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}) {
  if (!query.trim()) return <>{preview}</>

  try {
    const pattern = buildSearchRegExp(query, { caseSensitive, wholeWord, regex })
    const match = pattern.exec(preview)
    if (!match || match.index == null) return <>{preview}</>

    const start = match.index
    const end = start + match[0].length
    return (
      <>
        {preview.slice(0, start)}
        <mark className="editor-search-match-highlight rounded-[2px] bg-[var(--hb-search-match-bg)] px-0 text-inherit">
          {preview.slice(start, end)}
        </mark>
        {preview.slice(end)}
      </>
    )
  } catch {
    return <>{preview}</>
  }
}

export { BookOpen, FilterX }
