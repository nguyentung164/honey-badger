'use client'

import { Loader2, Pencil, Settings } from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import toast from '@/components/ui-elements/Toast'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useGitReposFromSourceFolders } from '@/hooks/useGitReposFromSourceFolders'

interface LocalRepoConfig {
  path: string
  name: string
  userName: string
  userEmail: string
}

interface VcsGitConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When multi-repo: project ID. Local repos = getSourceFoldersByProject(projectId). */
  selectedProjectId?: string | null
  /** When single-repo: selected source folder path. Only this repo is shown. */
  selectedSourceFolder?: string | null
}

export const VcsGitConfigDialog = memo(function VcsGitConfigDialog({
  open,
  onOpenChange,
  selectedProjectId,
  selectedSourceFolder,
}: VcsGitConfigDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const { repos, loading: reposLoading } = useGitReposFromSourceFolders(open, selectedProjectId, selectedSourceFolder)

  const [globalConfig, setGlobalConfig] = useState<{ userName: string; userEmail: string } | null>(null)
  const [localRepos, setLocalRepos] = useState<LocalRepoConfig[]>([])
  const [configLoading, setConfigLoading] = useState(false)
  const [editScope, setEditScope] = useState<'global' | 'local'>('global')
  const [editingRepoPath, setEditingRepoPath] = useState<string | null>(null)
  const [editUserName, setEditUserName] = useState('')
  const [editUserEmail, setEditUserEmail] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editConfigLoading, setEditConfigLoading] = useState(false)

  const loadGlobalConfig = useCallback(async () => {
    try {
      const globalResult = await window.api.vcs.git_get_config()
      if (globalResult?.global) {
        setGlobalConfig({
          userName: globalResult.global.userName ?? '',
          userEmail: globalResult.global.userEmail ?? '',
        })
      } else {
        setGlobalConfig(null)
      }
    } catch {
      setGlobalConfig(null)
    }
  }, [])

  const loadLocalConfigs = useCallback(async (reposToLoad: { path: string; name: string }[]) => {
    setConfigLoading(true)
    setLocalRepos([])
    try {
      const locals: LocalRepoConfig[] = []
      for (const repo of reposToLoad) {
        try {
          const config = await window.api.vcs.git_get_config(repo.path)
          const local = config?.local
          locals.push({
            path: repo.path,
            name: repo.name,
            userName: local?.userName ?? '',
            userEmail: local?.userEmail ?? '',
          })
        } catch {
          locals.push({ path: repo.path, name: repo.name, userName: '-', userEmail: '-' })
        }
      }
      setLocalRepos(locals)
    } catch (_err) {
      toast.error(t('settings.vcsUsers.loadError', 'Failed to load Git config'))
      setLocalRepos([])
    } finally {
      setConfigLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) loadGlobalConfig()
  }, [open, loadGlobalConfig])

  useEffect(() => {
    if (open && !reposLoading && repos.length > 0) {
      loadLocalConfigs(repos)
    } else if (open && !reposLoading) {
      setLocalRepos([])
      setConfigLoading(false)
    }
  }, [open, reposLoading, repos, loadLocalConfigs])

  const loading = reposLoading || configLoading

  const loadGitConfig = useCallback(async () => {
    await loadGlobalConfig()
    if (repos.length > 0) await loadLocalConfigs(repos)
  }, [loadGlobalConfig, loadLocalConfigs, repos])

  const handleEditGlobal = () => {
    setEditScope('global')
    setEditingRepoPath(null)
    if (globalConfig) {
      setEditUserName(globalConfig.userName)
      setEditUserEmail(globalConfig.userEmail)
    } else {
      setEditUserName('')
      setEditUserEmail('')
    }
    setEditDialogOpen(true)
  }

  const handleEditLocal = (repo: LocalRepoConfig) => {
    setEditScope('local')
    setEditingRepoPath(repo.path)
    setEditUserName(repo.userName)
    setEditUserEmail(repo.userEmail)
    setEditDialogOpen(true)
  }

  const handleSaveGitConfig = async () => {
    setEditConfigLoading(true)
    try {
      const result = await window.api.vcs.git_set_config(
        editUserName,
        editUserEmail,
        editScope,
        editScope === 'local' && editingRepoPath ? editingRepoPath : undefined
      )
      if (result.success) {
        toast.success(`${t('common.save')} OK`)
        loadGitConfig()
        setEditDialogOpen(false)
      } else {
        toast.error(result.error || t('settings.vcsUsers.saveError', 'Failed to save'))
      }
    } catch (_err) {
      toast.error(t('settings.vcsUsers.saveError', 'Failed to save Git config'))
    } finally {
      setEditConfigLoading(false)
    }
  }

  const editingRepoName = editScope === 'local' && editingRepoPath
    ? localRepos.find(r => r.path === editingRepoPath)?.name ?? editingRepoPath
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('settings.vcsUsers.gitConfig', 'Git Configuration')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading', 'Loading...')}
              </div>
            ) : (
              <div className="rounded-md border p-3 space-y-3 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('settings.vcsUsers.global', 'Global')}</p>
                    <p className="text-sm">
                      {globalConfig?.userName || '-'} / {globalConfig?.userEmail || '-'}
                    </p>
                  </div>
                  <Button variant={buttonVariant} size="sm" onClick={handleEditGlobal}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit', 'Edit')}
                  </Button>
                </div>

                {localRepos.length > 0 && (
                  <div className="flex flex-col min-h-0 pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('settings.vcsUsers.localRepos', 'Local (per repo)')}
                    </p>
                    <ScrollArea className="h-[200px] pr-2 -mr-2">
                      <div className="space-y-2">
                        {localRepos.map(repo => (
                          <div
                            key={repo.path}
                            className="flex items-center justify-between gap-2 py-2 px-2 rounded-md bg-muted/30 hover:bg-muted/50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate" title={repo.name}>
                                {repo.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {repo.userName || '-'} / {repo.userEmail || '-'}
                              </p>
                            </div>
                            <Button variant={buttonVariant} size="sm" className="shrink-0" onClick={() => handleEditLocal(repo)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t('common.edit', 'Edit')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('settings.vcsUsers.editGitConfig', 'Edit Git Config')}</DialogTitle>
            <DialogDescription>
              {editScope === 'global'
                ? t('settings.vcsUsers.global', 'Global')
                : editingRepoName
                  ? `${t('settings.vcsUsers.local', 'Local (this repo)')}: ${editingRepoName}`
                  : t('settings.vcsUsers.local', 'Local (this repo)')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="git-user-name">{t('settings.vcsUsers.userName', 'User Name')}</Label>
              <Input id="git-user-name" value={editUserName} onChange={e => setEditUserName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="git-user-email">{t('settings.vcsUsers.userEmail', 'User Email')}</Label>
              <Input id="git-user-email" type="email" value={editUserEmail} onChange={e => setEditUserEmail(e.target.value)} placeholder="john@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant={buttonVariant} onClick={() => setEditDialogOpen(false)} disabled={editConfigLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant={buttonVariant} onClick={handleSaveGitConfig} disabled={editConfigLoading}>
              {editConfigLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
