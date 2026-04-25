'use client'

import { Folder, Pencil, Unlink } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import toast from '@/components/ui-elements/Toast'
import { useSourceFolderStore } from '@/stores/useSourceFolderStore'
import type { ProjectOption } from './AddOrEditSourceFolderDialog'

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '') || p

interface FoldersByProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectList: ProjectOption[]
  mappings: { projectId: string; sourceFolderPath: string }[]
  initialProjectId?: string | null
  onEditFolder: (folder: { name: string; path: string }, projectId: string) => void
  onUnlinkFolder: (path: string) => Promise<void>
}

export function FoldersByProjectDialog({ open, onOpenChange, projectList, mappings, initialProjectId, onEditFolder, onUnlinkFolder }: FoldersByProjectDialogProps) {
  const { t } = useTranslation()
  const sourceFolderList = useSourceFolderStore(s => s.sourceFolderList)

  const mappingsByProject = useMemo(() => {
    const byProject = new Map<string, { path: string; name: string }[]>()
    for (const m of mappings) {
      const name = sourceFolderList.find(f => normPath(f.path) === normPath(m.sourceFolderPath))?.name ?? m.sourceFolderPath
      const arr = byProject.get(m.projectId) ?? []
      arr.push({ path: m.sourceFolderPath, name })
      byProject.set(m.projectId, arr)
    }
    return byProject
  }, [mappings, sourceFolderList])

  const handleEdit = useCallback(
    (f: { path: string; name: string }, projectId: string) => {
      const folder = sourceFolderList.find(sf => sf.path === f.path)
      if (folder) {
        onEditFolder(folder, projectId)
      }
    },
    [sourceFolderList, onEditFolder]
  )

  const handleUnlink = useCallback(
    async (path: string) => {
      try {
        await onUnlinkFolder(path)
        toast.success(t('settings.versioncontrol.folderUnlinked', 'Đã bỏ liên kết folder'))
      } catch (err: unknown) {
        toast.error((err as Error)?.message ?? t('toast.error'))
      }
    },
    [onUnlinkFolder, t]
  )

  const hasData = projectList.length > 0 && mappingsByProject.size > 0

  const defaultExpandedProjectId = (() => {
    if (initialProjectId && mappingsByProject.has(initialProjectId)) return initialProjectId
    const firstWithFolders = projectList.find(p => mappingsByProject.get(p.id)?.length)
    return firstWithFolders?.id ?? undefined
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5" />
            {t('settings.versioncontrol.foldersByProject', 'Source Folders theo Project')}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
          {!hasData ? (
            <p className="text-sm text-muted-foreground py-4">{t('settings.versioncontrol.noFoldersByProject', 'Chưa có folder nào được liên kết với project.')}</p>
          ) : (
            <Accordion type="single" collapsible className="w-full" defaultValue={defaultExpandedProjectId}>
              {projectList.map(p => {
                const folders = mappingsByProject.get(p.id)
                if (!folders?.length) return null
                return (
                  <AccordionItem key={p.id} value={p.id}>
                    <AccordionTrigger className="hover:no-underline py-3">
                      <span>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground font-normal text-xs font-bold"> ({folders.length})</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-0 pb-3 overflow-x-hidden">
                      <div className="max-h-[min(40vh,280px)] overflow-auto overflow-x-auto rounded-md border">
                        <Table className="w-max min-w-full">
                          <TableHeader sticky>
                            <TableRow>
                              <TableHead className="w-[40%]">{t('settings.versioncontrol.folderName', 'Tên')}</TableHead>
                              <TableHead className="min-w-[120px]">{t('settings.versioncontrol.path', 'Đường dẫn')}</TableHead>
                              <TableHead className="w-[80px] text-right">{t('common.actions', 'Thao tác')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {folders.map(f => (
                              <TableRow key={f.path}>
                                <TableCell className="font-medium truncate max-w-[180px]" title={f.name}>
                                  {f.name}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]" title={f.path}>
                                  {f.path}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(f, p.id)} title={t('common.edit', 'Sửa')}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                      onClick={() => handleUnlink(f.path)}
                                      title={t('common.unlink', 'Bỏ liên kết')}
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
