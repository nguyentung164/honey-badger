import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestProject } from 'shared/automation/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import toast from '@/components/ui-elements/Toast'
import { useAutomationStore } from '@/stores/useAutomationStore'
import { ProjectForm } from './ProjectForm'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ProjectList({ selectedId, onSelect }: Props) {
  const { t } = useTranslation()
  const projects = useAutomationStore(s => s.projects)
  const projectsLoading = useAutomationStore(s => s.projectsLoading)
  const setProjects = useAutomationStore(s => s.setProjects)
  const setProjectsLoading = useAutomationStore(s => s.setProjectsLoading)
  const removeProject = useAutomationStore(s => s.removeProject)

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<TestProject | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TestProject | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = async () => {
    setProjectsLoading(true)
    try {
      const res = await window.api.automation.project.list()
      if (res.status === 'success' && res.data) setProjects(res.data)
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await window.api.automation.project.delete(pendingDelete.id)
      if (res.status === 'success') {
        removeProject(pendingDelete.id)
        toast.success(t('automation.projects.deleted'))
      } else {
        toast.error(res.message ?? 'Delete failed')
      }
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('automation.projects.title')}</h2>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setOpenForm(true)
          }}
        >
          <Plus className="size-4" />
          {t('automation.projects.new')}
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
        {projectsLoading ? (
          <div className="col-span-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="col-span-full rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('automation.projects.empty')}
          </div>
        ) : (
          projects.map(p => (
            // biome-ignore lint/a11y/useSemanticElements: card wraps edit/delete <Button>s; outer <button> would nest buttons illegally.
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(p.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(p.id)
                }
              }}
              className={`group flex cursor-pointer flex-col gap-2 rounded-md border bg-card p-4 text-left transition hover:border-primary ${selectedId === p.id ? 'border-primary ring-1 ring-primary/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.baseUrl}</div>
                </div>
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={e => {
                      e.stopPropagation()
                      setEditing(p)
                      setOpenForm(true)
                    }}
                  >
                    {t('automation.projects.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation()
                      setPendingDelete(p)
                    }}
                    aria-label={t('automation.projects.delete')}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.browsers.map(b => (
                  <Badge key={b} variant="secondary" className="text-[10px] uppercase">
                    {b}
                  </Badge>
                ))}
              </div>
              {p.description ? <div className="line-clamp-2 text-xs text-muted-foreground">{p.description}</div> : null}
            </div>
          ))
        )}
      </div>

      <ProjectForm
        open={openForm}
        onOpenChange={setOpenForm}
        initial={editing}
        onSaved={async () => {
          setOpenForm(false)
          await refresh()
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('automation.projects.delete')}</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('automation.projects.deleteConfirm', { name: pendingDelete?.name ?? '' })}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('automation.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : t('automation.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
