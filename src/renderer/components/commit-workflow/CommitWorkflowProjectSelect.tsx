'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const LS_KEY = 'commit-workflow.lastProjectId'

type ProjectRow = { id: string; name: string }

export function CommitWorkflowProjectSelect({
  value,
  onChange,
  variant = 'manage',
  className,
  id = 'cw-project-select',
  labelId = 'cw-project-label',
}: {
  value: string
  onChange: (projectId: string) => void
  /** `manage` = PL/PM task UI projects; `leaderboard` = PL dashboard picker */
  variant?: 'manage' | 'leaderboard'
  className?: string
  id?: string
  labelId?: string
}) {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res =
        variant === 'leaderboard'
          ? await window.api.task.getProjectsForLeaderboardPicker()
          : await window.api.task.getProjectsForTaskUi()
      if (res.status === 'success' && res.data) {
        const list = (res.data as ProjectRow[]).map(p => ({ id: p.id, name: p.name }))
        setProjects(list)
        if (!value && list.length > 0) {
          let saved: string | null = null
          try {
            saved = window.localStorage.getItem(LS_KEY)
          } catch {
            /* ignore */
          }
          const pick = saved && list.some(p => p.id === saved) ? saved : list[0].id
          onChange(pick)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [variant, value, onChange])

  useEffect(() => {
    void load()
  }, [load])

  const handleChange = (id: string) => {
    onChange(id)
    try {
      window.localStorage.setItem(LS_KEY, id)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn('min-w-[12rem]', className)}>
      <Label id={labelId} htmlFor={id} className="text-xs text-muted-foreground">
        {t('commitWorkflow.filterProject')}
      </Label>
      <Select value={value || undefined} onValueChange={handleChange} disabled={loading || projects.length === 0}>
        <SelectTrigger id={id} className="mt-1 w-56" aria-labelledby={labelId}>
          <SelectValue placeholder={loading ? t('common.loading') : t('commitWorkflow.selectProject')} />
        </SelectTrigger>
        <SelectContent>
          {projects.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
