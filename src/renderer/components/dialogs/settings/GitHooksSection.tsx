'use client'

import { Edit3, Loader2, Plus, Power, Trash2 } from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '../../../stores/useAppearanceStore'
import { useConfigurationStore } from '../../../stores/useConfigurationStore'
import { useGitReposFromSourceFolders } from '@/hooks/useGitReposFromSourceFolders'
import { AddOrEditHookDialog } from './AddOrEditHookDialog'

interface HookInfo {
  name: string
  enabled: boolean
  hasContent: boolean
  hasSample: boolean
  preview?: string
}

export interface GitHooksSectionProps {
  /** Khi true: render compact, không dùng Card (dùng trong Git section) */
  embedded?: boolean
  /** When multi-repo: project ID to filter repos. Repos from getSourceFoldersByProject. */
  selectedProjectId?: string | null
  /** When single-repo: selected source folder path. Only this repo is shown. */
  selectedSourceFolder?: string | null
}

export const GitHooksSection = memo(function GitHooksSection({ embedded, selectedProjectId, selectedSourceFolder }: GitHooksSectionProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const sourceFolderFromStore = useConfigurationStore(s => s.sourceFolder)
  const { repos, loading: reposLoading } = useGitReposFromSourceFolders(!!embedded, selectedProjectId, selectedSourceFolder)

  const [selectedRepo, setSelectedRepo] = useState<{ path: string; name: string } | null>(null)
  const sourceFolder = embedded
    ? (selectedRepo?.path ?? repos[0]?.path ?? sourceFolderFromStore)
    : sourceFolderFromStore

  const [hooks, setHooks] = useState<HookInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [hookDialogOpen, setHookDialogOpen] = useState(false)
  const [editingHook, setEditingHook] = useState<string | null>(null)
  const [hookName, setHookName] = useState('')
  const [hookContent, setHookContent] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [hookToDelete, setHookToDelete] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [togglingHookName, setTogglingHookName] = useState<string | null>(null)
  const [editingHookLoading, setEditingHookLoading] = useState<string | null>(null)

  const loadHooks = useCallback(async () => {
    if (!sourceFolder) return
    setLoading(true)
    try {
      const result = await window.api.git.hooks_get(sourceFolder)
      if (result.status === 'success' && result.data) {
        setHooks(result.data)
      }
    } catch (err: any) {
      toast.error(t('settings.hooks.loadError', `Failed to load hooks:${err.message}`))
    } finally {
      setLoading(false)
    }
  }, [sourceFolder, t])

  useEffect(() => {
    if (embedded && repos.length > 0) {
      const stillValid = selectedRepo && repos.some(r => r.path === selectedRepo.path)
      if (!stillValid) setSelectedRepo(repos[0])
    } else if (embedded && repos.length === 0) {
      setSelectedRepo(null)
    }
  }, [embedded, repos, selectedRepo])

  useEffect(() => {
    if (sourceFolder) {
      loadHooks()
    } else {
      setHooks([])
    }
  }, [sourceFolder, loadHooks])

  const handleAddHook = () => {
    setEditingHook(null)
    setHookName('')
    setHookContent('')
    setHookDialogOpen(true)
  }

  const handleEditHook = async (name: string) => {
    setEditingHook(name)
    setHookName(name)
    setEditingHookLoading(name)
    try {
      const result = await window.api.git.hook_get_content(name, sourceFolder || undefined)
      if (result.status === 'success') {
        setHookContent(result.data || '')
        setHookDialogOpen(true)
      } else {
        toast.error(result.message || t('settings.hooks.loadError', 'Failed to load hook content'))
      }
    } catch {
      toast.error(t('settings.hooks.loadError', 'Failed to load hook content'))
    } finally {
      setEditingHookLoading(null)
    }
  }

  const handleSaveHook = async () => {
    if (!hookName.trim()) return
    setIsSaving(true)
    try {
      const result = await window.api.git.hook_set_content(hookName, hookContent, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('settings.hooks.saved', 'Hook saved'))
        setHookDialogOpen(false)
        loadHooks()
      } else {
        toast.error(result.message || t('settings.hooks.saveError', 'Failed to save hook'))
      }
    } catch {
      toast.error(t('settings.hooks.saveError', 'Failed to save hook'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteHookClick = (name: string) => {
    setHookToDelete(name)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteHookConfirm = async () => {
    const name = hookToDelete
    if (!name) return
    setIsDeleting(true)
    try {
      const result = await window.api.git.hook_delete(name, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('settings.hooks.deleted', 'Hook deleted'))
        setDeleteConfirmOpen(false)
        setHookToDelete(null)
        loadHooks()
      } else {
        toast.error(result.message || t('settings.hooks.deleteError', 'Failed to delete hook'))
      }
    } catch {
      toast.error(t('settings.hooks.deleteError', 'Failed to delete hook'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleHook = async (name: string, enabled: boolean) => {
    setTogglingHookName(name)
    try {
      const result = enabled ? await window.api.git.hook_enable(name, sourceFolder || undefined) : await window.api.git.hook_disable(name, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(enabled ? t('settings.hooks.enabled', 'Hook enabled') : t('settings.hooks.disabled', 'Hook disabled'))
        loadHooks()
      } else {
        toast.error(result.message || t('settings.hooks.toggleError', 'Failed to toggle hook'))
      }
    } catch {
      toast.error(t('settings.hooks.toggleError', 'Failed to toggle hook'))
    } finally {
      setTogglingHookName(null)
    }
  }

  const hooksWithContent = hooks.filter(h => h.hasContent)

  const hooksContent = (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.hooks.description', 'Hooks run automatically at specific Git events. They must exit with code 0 to succeed.')}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
      ) : hooksWithContent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.hooks.noHooks', 'No hooks configured. Click Add Hook to create one.')}</p>
      ) : (
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {hooksWithContent.map(hook => (
              <div key={hook.name} className="flex items-center justify-between gap-2 p-3 border rounded-md bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{hook.name}</div>
                  {hook.preview && <pre className="text-xs text-muted-foreground truncate mt-1 font-mono">{hook.preview}</pre>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch
                    checked={hook.enabled}
                    onCheckedChange={checked => handleToggleHook(hook.name, !!checked)}
                    disabled={togglingHookName === hook.name}
                    title={hook.enabled ? t('settings.hooks.disable', 'Disable') : t('settings.hooks.enable', 'Enable')}
                  />
                  <Button variant={buttonVariant} size="icon-sm" onClick={() => handleEditHook(hook.name)} title={t('common.edit', 'Edit')} disabled={editingHookLoading === hook.name}>
                    {editingHookLoading === hook.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
                  </Button>
                  <Button variant={buttonVariant} size="icon-sm" onClick={() => handleDeleteHookClick(hook.name)} title={t('common.delete', 'Delete')}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  )

  const headerRow = (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Power className="w-4 h-4" />
        {t('settings.hooks.title', 'Git Hooks')}
      </span>
      <Button variant={buttonVariant} size="sm" onClick={handleAddHook}>
        <Plus className="h-4 w-4 mr-2" />
        {t('settings.hooks.addHook', 'Add Hook')}
      </Button>
    </div>
  )

  const showTabs = embedded && repos.length > 1

  if (embedded) {
    return (
      <>
        <div className="space-y-3">
          {headerRow}
          {reposLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</p>
          ) : repos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.versioncontrol.selectRepoNoGitRepos', 'Không có repo Git.')}</p>
          ) : showTabs ? (
            <Tabs value={selectedRepo?.path ?? repos[0]?.path ?? ''} onValueChange={v => setSelectedRepo(repos.find(r => r.path === v) ?? null)}>
              <TabsList className="w-full flex-wrap h-auto gap-1">
                {repos.map(r => (
                  <TabsTrigger key={r.path} value={r.path} className="text-xs truncate max-w-[140px]">
                    {r.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={selectedRepo?.path ?? repos[0]?.path ?? ''} className="mt-3">
                {hooksContent}
              </TabsContent>
            </Tabs>
          ) : (
            hooksContent
          )}
        </div>
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={open => {
            setDeleteConfirmOpen(open)
            if (!open) setHookToDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
              <AlertDialogDescription>{t('settings.hooks.deleteConfirm', 'Delete this hook?')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteHookConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isDeleting ? t('common.loading', 'Loading...') : t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AddOrEditHookDialog
          open={hookDialogOpen}
          onOpenChange={setHookDialogOpen}
          hookName={hookName}
          hookContent={hookContent}
          setHookName={setHookName}
          setHookContent={setHookContent}
          onSave={handleSaveHook}
          isEditMode={!!editingHook}
          isSaving={isSaving}
        />
      </>
    )
  }

  return (
    <>
      <Card className="w-full gap-2 py-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Power className="w-5 h-5" />
            {t('settings.hooks.title', 'Git Hooks')}
          </CardTitle>
          <Button variant={buttonVariant} size="sm" onClick={handleAddHook}>
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.hooks.addHook', 'Add Hook')}
          </Button>
        </CardHeader>
        <CardContent>{hooksContent}</CardContent>
      </Card>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={open => {
          setDeleteConfirmOpen(open)
          if (!open) setHookToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.hooks.deleteConfirm', 'Delete this hook?')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHookConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isDeleting ? t('common.loading', 'Loading...') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddOrEditHookDialog
        open={hookDialogOpen}
        onOpenChange={setHookDialogOpen}
        hookName={hookName}
        hookContent={hookContent}
        setHookName={setHookName}
        setHookContent={setHookContent}
        onSave={handleSaveHook}
        isEditMode={!!editingHook}
        isSaving={isSaving}
      />
    </>
  )
})
