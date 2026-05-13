import { Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TestCase } from 'shared/automation/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { automationEmptyCases, useAutomationStore } from '@/stores/useAutomationStore'
import { CaseEditor } from './CaseEditor'
import { CaseImportDialog } from './CaseImportDialog'

interface Props {
  projectId: string
}

export function CaseTable({ projectId }: Props) {
  const { t } = useTranslation()
  const cases = useAutomationStore(s => s.cases[projectId] ?? automationEmptyCases)
  const setCases = useAutomationStore(s => s.setCases)
  const setCasesLoading = useAutomationStore(s => s.setCasesLoading)
  const casesLoading = useAutomationStore(s => s.casesLoading)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<TestCase | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const refresh = async () => {
    setCasesLoading(true)
    try {
      const res = await window.api.automation.case.list(projectId)
      if (res.status === 'success' && res.data) setCases(projectId, res.data)
    } finally {
      setCasesLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [projectId])

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return cases
    return cases.filter(
      c => c.code.toLowerCase().includes(f) || c.title.toLowerCase().includes(f) || c.tags.some(tg => tg.toLowerCase().includes(f))
    )
  }, [cases, filter])

  const handleDelete = async (id: string) => {
    const res = await window.api.automation.case.delete(id)
    if (res.status === 'success') {
      toast.success(t('automation.cases.deleted'))
      await refresh()
    } else {
      toast.error(res.message ?? 'Delete failed')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder={t('automation.cases.filterPlaceholder')}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            {t('automation.cases.importLabel')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t('automation.cases.new')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t('automation.cases.columns.code')}</TableHead>
              <TableHead>{t('automation.cases.columns.title')}</TableHead>
              <TableHead className="w-24">{t('automation.cases.columns.priority')}</TableHead>
              <TableHead className="w-32">{t('automation.cases.columns.tags')}</TableHead>
              <TableHead className="w-24">{t('automation.cases.columns.source')}</TableHead>
              <TableHead className="w-24">{t('automation.cases.columns.spec')}</TableHead>
              <TableHead className="w-24 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {casesLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {t('automation.common.loading')}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {t('automation.cases.empty')}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(c => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setEditing(c)
                    setEditorOpen(true)
                  }}
                >
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>
                    <Badge
                      variant={c.priority === 'critical' || c.priority === 'high' ? 'destructive' : c.priority === 'medium' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {c.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{c.source}</TableCell>
                  <TableCell>
                    <Badge variant={c.specStatus === 'saved' ? 'default' : c.specStatus === 'draft' ? 'secondary' : 'outline'} className="capitalize">
                      {c.specStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation()
                          setEditing(c)
                          setEditorOpen(true)
                        }}
                        aria-label={t('automation.cases.edit')}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation()
                          void handleDelete(c.id)
                        }}
                        aria-label={t('automation.cases.delete')}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CaseEditor
        projectId={projectId}
        initial={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={async () => {
          setEditorOpen(false)
          await refresh()
        }}
      />

      <CaseImportDialog
        projectId={projectId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={async () => {
          setImportOpen(false)
          await refresh()
        }}
      />
    </div>
  )
}
