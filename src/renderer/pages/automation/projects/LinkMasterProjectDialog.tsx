import { Link2, Loader2, Unlink } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestProjectTaskLink } from 'shared/automation/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from '@/components/ui-elements/Toast'

type TaskProjectRow = { id: string; name: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  testProjectId: string
  onLinksChanged?: () => void
}

export function LinkMasterProjectDialog({ open, onOpenChange, testProjectId, onLinksChanged }: Props) {
  const { t } = useTranslation()
  const [taskProjects, setTaskProjects] = useState<TaskProjectRow[]>([])
  const [links, setLinks] = useState<TestProjectTaskLink[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!testProjectId) return
    setLoading(true)
    try {
      const [tasksRes, linksRes] = await Promise.all([
        window.api.task.getProjectsForTaskUi(),
        window.api.automation.project.listTaskLinks(testProjectId),
      ])
      if (tasksRes.status === 'success' && tasksRes.data) {
        setTaskProjects(tasksRes.data.map((p: { id: any; name: any }) => ({ id: p.id, name: p.name })))
      } else {
        setTaskProjects([])
      }
      if (linksRes.status === 'success' && linksRes.data) {
        setLinks(linksRes.data)
      } else {
        setLinks([])
      }
    } finally {
      setLoading(false)
    }
  }, [testProjectId])

  useEffect(() => {
    if (!open) return
    setSelectedTaskId('')
    void load()
  }, [open, load])

  const linkedTaskIds = new Set(links.map(l => l.taskProjectId))
  const availableToLink = taskProjects.filter(p => !linkedTaskIds.has(p.id))

  const handleLink = async () => {
    if (!selectedTaskId) return
    setLinking(true)
    try {
      const res = await window.api.automation.project.linkTask({ testProjectId, taskProjectId: selectedTaskId })
      if (res.status === 'success' && res.data) {
        const linked = res.data
        setLinks(prev => [...prev, linked])
        setSelectedTaskId('')
        toast.success(t('automation.projects.linkMaster.linked'))
        onLinksChanged?.()
      } else {
        toast.error(res.message ?? t('automation.projects.linkMaster.linkFailed'))
      }
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async (link: TestProjectTaskLink) => {
    setUnlinkingId(link.id)
    try {
      const res = await window.api.automation.project.unlinkTask({
        testProjectId,
        taskProjectId: link.taskProjectId,
      })
      if (res.status === 'success' && res.data?.unlinked) {
        setLinks(prev => prev.filter(l => l.id !== link.id))
        toast.success(t('automation.projects.linkMaster.unlinked'))
        onLinksChanged?.()
      } else {
        toast.error(res.message ?? t('automation.projects.linkMaster.unlinkFailed'))
      }
    } finally {
      setUnlinkingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 shrink-0" aria-hidden />
            {t('automation.projects.linkMaster.title')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('automation.projects.linkMaster.description')}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('automation.projects.linkMaster.linkedHeading')}
              </div>
              {links.length === 0 ? (
                <p className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {t('automation.projects.linkMaster.noneLinked')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {links.map(link => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/25 px-3 py-2"
                    >
                      <Badge variant="secondary" className="max-w-full truncate font-normal">
                        {link.taskProjectName ?? link.taskProjectId}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={unlinkingId === link.id}
                        onClick={() => void handleUnlink(link)}
                        aria-label={t('automation.projects.linkMaster.unlink')}
                      >
                        {unlinkingId === link.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Unlink className="size-4" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <Label htmlFor="link-master-project-select">{t('automation.projects.linkMaster.selectLabel')}</Label>
              <Select
                value={selectedTaskId || undefined}
                onValueChange={setSelectedTaskId}
                disabled={availableToLink.length === 0}
              >
                <SelectTrigger id="link-master-project-select" className="w-full">
                  <SelectValue
                    placeholder={
                      availableToLink.length === 0
                        ? t('automation.projects.linkMaster.noAvailable')
                        : t('automation.projects.linkMaster.selectPlaceholder')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableToLink.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('automation.common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleLink()} disabled={!selectedTaskId || linking}>
            {linking ? <Loader2 className="size-4 animate-spin" /> : t('automation.projects.linkMaster.linkAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
