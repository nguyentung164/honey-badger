'use client'

import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MainShellView } from 'shared/mainShellView'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getShellTabDef, normalizeShellTabOrder } from '@/lib/shellTabDefs'
import { cn } from '@/lib/utils'
import { shellTabAccentTextClass } from '@/pages/main/shellTabStyles'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'

type SortableShellTabRowProps = {
  tabValue: MainShellView
  hidden: boolean
  isLastVisible: boolean
  onToggleHidden: (hidden: boolean) => void
}

const SortableShellTabRow = memo(function SortableShellTabRow({ tabValue, hidden, isLastVisible, onToggleHidden }: SortableShellTabRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabValue })
  const tab = getShellTabDef(tabValue)
  if (!tab) return null

  const Icon = tab.icon
  const label = tab.defaultLabel != null ? t(tab.labelKey, tab.defaultLabel) : t(tab.labelKey)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-9 w-full items-center gap-1 rounded border px-2 transition-colors',
        isDragging ? 'z-10 border-primary/40 bg-background shadow-sm' : 'border-border/60 bg-muted/15',
        hidden && !isDragging && 'opacity-50'
      )}
      title={isLastVisible ? t('settings.shellTabs.lastVisibleHint', 'Keep at least one tab visible') : undefined}
    >
      <button
        type="button"
        className="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground active:cursor-grabbing"
        aria-label={t('settings.shellTabs.dragHandle', 'Drag to reorder')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Label
        htmlFor={`shell-tab-${tabValue}`}
        className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-sm font-normal leading-normal', isLastVisible ? 'cursor-not-allowed' : 'cursor-pointer')}
      >
        <Icon className={cn('h-4 w-4 shrink-0', !hidden && shellTabAccentTextClass(tabValue))} />
        <span className="truncate">{label}</span>
      </Label>
      <Switch id={`shell-tab-${tabValue}`} size="sm" checked={!hidden} disabled={isLastVisible} onCheckedChange={checked => onToggleHidden(!checked)} aria-label={label} />
    </div>
  )
})

export const ShellTabOrderSettings = memo(function ShellTabOrderSettings() {
  const hiddenShellTabs = useAppearanceStoreSelect(s => s.hiddenShellTabs)
  const shellTabOrder = useAppearanceStoreSelect(s => s.shellTabOrder)
  const setShellTabHidden = useAppearanceStoreSelect(s => s.setShellTabHidden)
  const setShellTabOrder = useAppearanceStoreSelect(s => s.setShellTabOrder)

  const orderedTabs = useMemo(() => normalizeShellTabOrder(shellTabOrder), [shellTabOrder])
  const visibleShellTabCount = useMemo(() => orderedTabs.length - hiddenShellTabs.length, [hiddenShellTabs.length, orderedTabs.length])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedTabs.indexOf(active.id as MainShellView)
    const newIndex = orderedTabs.indexOf(over.id as MainShellView)
    if (oldIndex < 0 || newIndex < 0) return
    setShellTabOrder(arrayMove(orderedTabs, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTabs} strategy={verticalListSortingStrategy}>
        <div className="flex w-full flex-col gap-0.5">
          {orderedTabs.map(tabValue => {
            const hidden = hiddenShellTabs.includes(tabValue)
            const isLastVisible = !hidden && visibleShellTabCount <= 1
            return (
              <SortableShellTabRow
                key={tabValue}
                tabValue={tabValue}
                hidden={hidden}
                isLastVisible={isLastVisible}
                onToggleHidden={nextHidden => setShellTabHidden(tabValue, nextHidden)}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
})
