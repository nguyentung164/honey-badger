'use client'

import {
  Cloud,
  Monitor,
  Rocket,
  Server,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { renderNodeIcon } from '@/components/flow-inspector/nodeIconUtils'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  PIPELINE_NODE_TEMPLATES,
  PIPELINE_SNIPPET_TEMPLATES,
  PIPELINE_TEMPLATE_CATEGORIES,
  type PipelineNodeTemplate,
  type PipelineSnippetTemplate,
  type PipelineTemplateCategory,
} from 'shared/devPipelines/templateCatalog'

const CATEGORY_KEY: Record<PipelineTemplateCategory, string> = {
  frontend: 'devPipelines.tpl.catFrontend',
  backend: 'devPipelines.tpl.catBackend',
  deploy: 'devPipelines.tpl.catDeploy',
  cloud: 'devPipelines.tpl.catCloud',
  utility: 'devPipelines.tpl.catUtility',
  demo: 'devPipelines.tpl.catDemo',
}

const CATEGORY_META: Record<
  PipelineTemplateCategory,
  { icon: LucideIcon; iconWrap: string; iconColor: string; accentBorder: string }
> = {
  frontend: {
    icon: Monitor,
    iconWrap: 'bg-sky-500/15',
    iconColor: 'text-sky-600 dark:text-sky-400',
    accentBorder: 'border-sky-500/20',
  },
  backend: {
    icon: Server,
    iconWrap: 'bg-violet-500/15',
    iconColor: 'text-violet-600 dark:text-violet-400',
    accentBorder: 'border-violet-500/20',
  },
  deploy: {
    icon: Rocket,
    iconWrap: 'bg-orange-500/15',
    iconColor: 'text-orange-600 dark:text-orange-400',
    accentBorder: 'border-orange-500/20',
  },
  cloud: {
    icon: Cloud,
    iconWrap: 'bg-blue-500/15',
    iconColor: 'text-blue-600 dark:text-blue-400',
    accentBorder: 'border-blue-500/20',
  },
  utility: {
    icon: Wrench,
    iconWrap: 'bg-zinc-500/15',
    iconColor: 'text-zinc-600 dark:text-zinc-300',
    accentBorder: 'border-zinc-500/20',
  },
  demo: {
    icon: Sparkles,
    iconWrap: 'bg-amber-500/15',
    iconColor: 'text-amber-600 dark:text-amber-400',
    accentBorder: 'border-amber-500/20',
  },
}

function matchesSearch(text: string, desc: string, tags: string[], q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return (
    text.toLowerCase().includes(lower) ||
    desc.toLowerCase().includes(lower) ||
    tags.some(t => t.toLowerCase().includes(lower))
  )
}

function PlatformBadge({ platform }: { platform?: PipelineNodeTemplate['platform'] }) {
  const { t } = useTranslation()
  if (platform === 'windows') {
    return (
      <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
        {t('devPipelines.tpl.platformWindows')}
      </Badge>
    )
  }
  if (platform === 'linux') {
    return (
      <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
        {t('devPipelines.tpl.platformLinux')}
      </Badge>
    )
  }
  return null
}

function NodeCard({ tpl, onClickTemplate }: { tpl: PipelineNodeTemplate; onClickTemplate: (id: string, kind: 'node' | 'snippet') => void }) {
  const { t } = useTranslation()
  const label = t(`devPipelines.tpl.${tpl.labelKey}`)
  const desc = t(`devPipelines.tpl.${tpl.descriptionKey}`)
  const didDragRef = useRef(false)

  return (
    <button
      type="button"
      draggable
      onDragStart={e => {
        didDragRef.current = true
        e.dataTransfer.setData('pipeline/template-id', tpl.id)
        e.dataTransfer.setData('pipeline/template-kind', 'node')
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          didDragRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (didDragRef.current) return
        onClickTemplate(tpl.id, 'node')
      }}
      className="flex w-full cursor-grab items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted/60 active:cursor-grabbing"
    >
      <div className="mt-0.5 shrink-0">
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: tpl.accentColor }}
          aria-hidden
        />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {renderNodeIcon(tpl.iconKey, { className: 'size-4 shrink-0 text-muted-foreground' })}
          <span className="min-w-0 truncate text-xs font-medium leading-tight">{label}</span>
          <PlatformBadge platform={tpl.platform} />
        </div>
        <span className="truncate text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </div>
    </button>
  )
}

function SnippetCard({ snip, onClickTemplate }: { snip: PipelineSnippetTemplate; onClickTemplate: (id: string, kind: 'node' | 'snippet') => void }) {
  const { t } = useTranslation()
  const label = t(`devPipelines.tpl.${snip.labelKey}`)
  const desc = t(`devPipelines.tpl.${snip.descriptionKey}`)
  const firstNode = snip.nodes[0]
  const nodeCount = snip.nodes.length
  const didDragRef = useRef(false)

  return (
    <button
      type="button"
      draggable
      onDragStart={e => {
        didDragRef.current = true
        e.dataTransfer.setData('pipeline/template-id', snip.id)
        e.dataTransfer.setData('pipeline/template-kind', 'snippet')
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          didDragRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (didDragRef.current) return
        onClickTemplate(snip.id, 'snippet')
      }}
      className="flex w-full cursor-grab items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted/60 active:cursor-grabbing"
    >
      <div className="mt-0.5 shrink-0">
        {firstNode ? (
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: firstNode.accentColor }}
            aria-hidden
          />
        ) : (
          <span className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {firstNode ? renderNodeIcon(firstNode.iconKey, { className: 'size-4 shrink-0', style: { color: firstNode.accentColor } }) : null}
            <span className="truncate text-xs font-medium leading-tight">{label}</span>
          </div>
          <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
            {t('devPipelines.tpl.stepCount', { count: nodeCount })}
          </span>
        </div>
        <span className="truncate text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </div>
    </button>
  )
}

function CategoryAccordionHeader({ category, count }: { category: PipelineTemplateCategory; count: number }) {
  const { t } = useTranslation()
  const meta = CATEGORY_META[category]
  const Icon = meta.icon

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 pr-1">
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', meta.iconWrap)}>
        <Icon className={cn('size-3.5', meta.iconColor)} aria-hidden />
      </span>
      <span className="min-w-0 truncate text-xs font-medium">{t(CATEGORY_KEY[category])}</span>
      <span className={cn('ml-auto shrink-0 rounded-full border px-1.5 py-0 text-[10px] tabular-nums', meta.iconWrap, meta.iconColor, meta.accentBorder)}>
        {count}
      </span>
    </span>
  )
}

function TemplateCategoryAccordion<T extends { id: string; category: PipelineTemplateCategory }>({
  groups,
  open,
  onOpenChange,
  renderItem,
  empty,
}: {
  groups: Array<{ category: PipelineTemplateCategory; items: T[] }>
  open: string[]
  onOpenChange: (value: string[]) => void
  renderItem: (item: T) => ReactNode
  empty: ReactNode
}) {
  if (groups.length === 0) return empty

  return (
    <Accordion type="multiple" value={open} onValueChange={onOpenChange} className="w-full">
      {groups.map(({ category, items }) => {
        const meta = CATEGORY_META[category]
        return (
          <AccordionItem
            key={category}
            value={category}
            className={cn('border-b border-border/60 last:border-b-0', meta.accentBorder)}
          >
            <AccordionTrigger className="items-center px-1 py-2 text-xs hover:no-underline hover:bg-muted/40 [&[data-state=open]]:bg-muted/30">
              <CategoryAccordionHeader category={category} count={items.length} />
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-0">
              <div className="flex flex-col gap-0.5 pl-0.5">
                {items.map(item => (
                  <div key={item.id}>{renderItem(item)}</div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

export function PipelineTemplatePanel({ onClickTemplate }: { onClickTemplate: (id: string, kind: 'node' | 'snippet') => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'steps' | 'recipes'>('steps')
  const [openSteps, setOpenSteps] = useState<string[]>([])
  const [openRecipes, setOpenRecipes] = useState<string[]>([])

  const groupedNodes = useMemo(() => {
    return PIPELINE_TEMPLATE_CATEGORIES.map(category => ({
      category,
      items: PIPELINE_NODE_TEMPLATES.filter(tpl => {
        if (tpl.category !== category) return false
        const label = t(`devPipelines.tpl.${tpl.labelKey}`)
        const desc = t(`devPipelines.tpl.${tpl.descriptionKey}`)
        return matchesSearch(label, desc, tpl.tags, search)
      }),
    })).filter(group => group.items.length > 0)
  }, [search, t])

  const groupedSnippets = useMemo(() => {
    return PIPELINE_TEMPLATE_CATEGORIES.map(category => ({
      category,
      items: PIPELINE_SNIPPET_TEMPLATES.filter(snip => {
        if (snip.category !== category) return false
        const label = t(`devPipelines.tpl.${snip.labelKey}`)
        const desc = t(`devPipelines.tpl.${snip.descriptionKey}`)
        return matchesSearch(label, desc, snip.tags, search)
      }),
    })).filter(group => group.items.length > 0)
  }, [search, t])

  const visibleStepCategories = useMemo(() => groupedNodes.map(g => g.category), [groupedNodes])
  const visibleRecipeCategories = useMemo(() => groupedSnippets.map(g => g.category), [groupedSnippets])

  useEffect(() => {
    setOpenSteps(search.trim() ? visibleStepCategories : [])
  }, [search, visibleStepCategories])

  useEffect(() => {
    setOpenRecipes(search.trim() ? visibleRecipeCategories : [])
  }, [search, visibleRecipeCategories])

  const emptyMessage = (
    <p className="py-6 text-center text-xs text-muted-foreground">{t('devPipelines.tpl.noResults')}</p>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <div className="px-2 pt-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('devPipelines.tpl.stepSearch')}
          className="h-8 text-xs"
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={v => setTab(v as 'steps' | 'recipes')}
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <div className="px-2">
          <TabsList className="h-7 w-full bg-muted/40 p-[3px]">
            <TabsTrigger value="steps" className="h-6 flex-1 px-2 text-xs">
              {t('devPipelines.tpl.tabSteps')}
            </TabsTrigger>
            <TabsTrigger value="recipes" className="h-6 flex-1 px-2 text-xs">
              {t('devPipelines.tpl.tabRecipes')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="steps" className="relative mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <div
            className="absolute inset-0 overflow-y-auto overscroll-y-contain"
            onWheel={e => e.stopPropagation()}
          >
            <div className="p-2">
              <TemplateCategoryAccordion
                groups={groupedNodes}
                open={openSteps}
                onOpenChange={setOpenSteps}
                renderItem={tpl => <NodeCard tpl={tpl} onClickTemplate={onClickTemplate} />}
                empty={emptyMessage}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recipes" className="relative mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <div
            className="absolute inset-0 overflow-y-auto overscroll-y-contain"
            onWheel={e => e.stopPropagation()}
          >
            <div className="p-2">
              <TemplateCategoryAccordion
                groups={groupedSnippets}
                open={openRecipes}
                onOpenChange={setOpenRecipes}
                renderItem={snip => <SnippetCard snip={snip} onClickTemplate={onClickTemplate} />}
                empty={emptyMessage}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
