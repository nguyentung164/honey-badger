'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const LS_KEY = 'commit-workflow.lastProjectId'
const ALL_PROJECTS = '__all__'

type ProjectRow = { id: string; name: string }
type LeaderboardPickerScope = 'admin' | 'managed' | 'dev'

export function CommitWorkflowProjectSelect({
  value,
  onChange,
  variant = 'manage',
  allowAll = false,
  className,
  id = 'cw-project-select',
  labelId = 'cw-project-label',
}: {
  value: string
  onChange: (projectId: string) => void
  /** `manage` = PL/PM task UI projects; `leaderboard` = PL dashboard picker */
  variant?: 'manage' | 'leaderboard'
  /** When true and leaderboard scope is admin, prepend "All projects". Value `''` when selected. */
  allowAll?: boolean
  className?: string
  id?: string
  labelId?: string
}) {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [pickerScope, setPickerScope] = useState<LeaderboardPickerScope | null>(null)
  const [loading, setLoading] = useState(false)
  const hasInitializedRef = useRef(false)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res =
        variant === 'leaderboard'
          ? await window.api.task.getProjectsForLeaderboardPicker()
          : await window.api.task.getProjectsForTaskUi()

      if (res.status !== 'success' || !res.data) {
        setProjects([])
        setPickerScope(null)
        return
      }

      if (variant === 'leaderboard') {
        const data = res.data as { scope: LeaderboardPickerScope; projects: ProjectRow[] }
        setPickerScope(data.scope)
        setProjects((data.projects ?? []).map(p => ({ id: p.id, name: p.name })))
      } else {
        setPickerScope(null)
        setProjects((res.data as ProjectRow[]).map(p => ({ id: p.id, name: p.name })))
      }
    } finally {
      setLoading(false)
    }
  }, [variant])

  useEffect(() => {
    hasInitializedRef.current = false
    void loadProjects()
  }, [loadProjects])

  const showAllOption = allowAll && pickerScope === 'admin'

  useEffect(() => {
    if (loading || hasInitializedRef.current) return
    if (projects.length === 0 && !showAllOption) return

    hasInitializedRef.current = true

    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(LS_KEY)
    } catch {
      /* ignore */
    }

    if (saved && projects.some(p => p.id === saved)) {
      onChange(saved)
      return
    }

    if (showAllOption) {
      onChange('')
      return
    }

    const first = projects[0]?.id
    if (first) onChange(first)
  }, [loading, projects, showAllOption, onChange])

  const handleChange = (next: string) => {
    const projectId = next === ALL_PROJECTS ? '' : next
    onChange(projectId)
    try {
      if (projectId) {
        window.localStorage.setItem(LS_KEY, projectId)
      } else {
        window.localStorage.removeItem(LS_KEY)
      }
    } catch {
      /* ignore */
    }
  }

  const selectValue = value ? value : showAllOption ? ALL_PROJECTS : undefined

  const emptyHint = useMemo(() => {
    if (loading) return t('common.loading')
    if (projects.length > 0 || showAllOption) return t('commitWorkflow.selectProject')
    return t('commitWorkflow.noProjectsForFilter')
  }, [loading, projects.length, showAllOption, t])

  return (
    <div className={cn('min-w-[12rem]', className)}>
      <Label id={labelId} htmlFor={id} className="text-xs text-muted-foreground">
        {t('commitWorkflow.filterProject')}
      </Label>
      <Select value={selectValue} onValueChange={handleChange} disabled={loading || (!showAllOption && projects.length === 0)}>
        <SelectTrigger id={id} className="mt-1 w-56" aria-labelledby={labelId} title={!loading && projects.length === 0 && !showAllOption ? emptyHint : undefined}>
          <SelectValue placeholder={emptyHint} />
        </SelectTrigger>
        <SelectContent>
          {showAllOption ? (
            <SelectItem value={ALL_PROJECTS}>{t('commitWorkflow.filterProjectAll')}</SelectItem>
          ) : null}
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
