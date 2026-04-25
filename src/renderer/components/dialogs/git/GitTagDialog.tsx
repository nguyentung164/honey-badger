'use client'

import { Check, Loader2, Plus, Server, Tag, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import logger from '@/services/logger'
import { useAppearanceStoreSelect } from '@/stores/useAppearanceStore'
import { useGitReposFromSourceFolders } from '@/hooks/useGitReposFromSourceFolders'

interface GitTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTagComplete?: () => void
  /** When multi-repo: project ID to filter repos. Repos from getSourceFoldersByProject. */
  selectedProjectId?: string | null
  /** When single-repo: selected source folder path. Only this repo is shown. */
  selectedSourceFolder?: string | null
}

export function GitTagDialog({ open, onOpenChange, onTagComplete, selectedProjectId, selectedSourceFolder }: GitTagDialogProps) {
  const { t } = useTranslation()
  const buttonVariant = useAppearanceStoreSelect(s => s.buttonVariant)
  const { repos, loading: reposLoading } = useGitReposFromSourceFolders(open, selectedProjectId, selectedSourceFolder)
  const [selectedRepo, setSelectedRepo] = useState<{ path: string; name: string } | null>(null)
  const sourceFolder = selectedRepo?.path
  const [tags, setTags] = useState<string[]>([])
  const [remoteTags, setRemoteTags] = useState<string[]>([])
  const [remotes, setRemotes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [operatingTag, setOperatingTag] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagMessage, setNewTagMessage] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<string | null>(null)

  const loadTags = async (remote: string = 'origin') => {
    setIsLoading(true)
    try {
      const cwd = sourceFolder || undefined
      const [localResult, remoteResult] = await Promise.all([window.api.git.list_tags(cwd), window.api.git.list_remote_tags(remote, cwd)])
      if (localResult.status === 'success') {
        setTags(localResult.data || [])
      } else {
        toast.error(localResult.message || 'Không thể tải danh sách tags')
      }
      if (remoteResult.status === 'success') {
        setRemoteTags(remoteResult.data || [])
      } else {
        setRemoteTags([])
      }
    } catch (error) {
      logger.error('Error loading tags:', error)
      toast.error('Không thể tải danh sách tags')
    } finally {
      setIsLoading(false)
    }
  }

  const getDefaultRemote = (list: string[]): string => {
    if (!list?.length) return 'origin'
    if (list.includes('origin')) return 'origin'
    const valid = list.find(r => typeof r === 'string' && r.length > 0 && r !== '0')
    return valid || 'origin'
  }

  const loadRemotes = async (): Promise<string[]> => {
    try {
      const result = await window.api.git.get_remotes(sourceFolder || undefined)
      const list = result.status === 'success' && result.data ? Object.keys(result.data) : ['origin']
      const finalList = list.length > 0 ? list : ['origin']
      setRemotes(finalList)
      return finalList
    } catch {
      setRemotes(['origin'])
      return ['origin']
    }
  }

  useEffect(() => {
    if (repos.length > 0) {
      const stillValid = selectedRepo && repos.some(r => r.path === selectedRepo.path)
      if (!stillValid) setSelectedRepo(repos[0])
    } else {
      setSelectedRepo(null)
    }
  }, [repos])

  useEffect(() => {
    if (open && sourceFolder) {
      setShowCreateForm(false)
      setNewTagName('')
      setNewTagMessage('')
      const init = async () => {
        const remoteList = await loadRemotes()
        loadTags(getDefaultRemote(remoteList))
      }
      init()
    }
  }, [open, sourceFolder])

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.warning(t('git.tag.nameRequired'))
      return
    }

    setIsCreating(true)
    try {
      const result = await window.api.git.create_tag(newTagName.trim(), newTagMessage.trim() || undefined, undefined, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.tag.createSuccess'))
        setNewTagName('')
        setNewTagMessage('')
        setShowCreateForm(false)
        await loadTags(getDefaultRemote(remotes))
        onTagComplete?.()
      } else {
        toast.error(result.message || t('git.tag.createError'))
      }
    } catch (error) {
      logger.error('Error creating tag:', error)
      toast.error(t('git.tag.createError'))
    } finally {
      setIsCreating(false)
    }
  }

  const handlePushTag = async (tagName: string) => {
    const remote = getDefaultRemote(remotes)
    if (remote === 'origin' && remotes.length === 0) {
      toast.warning(t('git.tag.noRemote'))
      return
    }

    setOperatingTag(tagName)
    try {
      const result = await window.api.git.push_tag(tagName, remote, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.tag.pushSuccess'))
        await loadTags(remote)
        onTagComplete?.()
      } else {
        toast.error(result.message || t('git.tag.pushError'))
      }
    } catch (error) {
      logger.error('Error pushing tag:', error)
      toast.error(t('git.tag.pushError'))
    } finally {
      setOperatingTag(null)
    }
  }

  const remoteTagsSet = new Set(remoteTags)
  const remoteOnlyTags = remoteTags.filter(t => !tags.includes(t))

  const handleDeleteTagClick = (tagName: string) => {
    setTagToDelete(tagName)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteTagConfirm = async () => {
    const tag = tagToDelete
    if (!tag) return

    setOperatingTag(tag)
    setDeleteConfirmOpen(false)
    setTagToDelete(null)

    try {
      const result = await window.api.git.delete_tag(tag, undefined, sourceFolder || undefined)
      if (result.status === 'success') {
        toast.success(t('git.tag.deleteSuccess'))
        await loadTags()
        onTagComplete?.()
      } else {
        toast.error(result.message || t('git.tag.deleteError'))
      }
    } catch (error) {
      logger.error('Error deleting tag:', error)
      toast.error(t('git.tag.deleteError'))
    } finally {
      setOperatingTag(null)
    }
  }

  const renderContent = () => (
    <div className="space-y-3">
            {showCreateForm ? (
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('git.tag.tagName')}</Label>
                  <Input placeholder={t('git.tag.tagNamePlaceholder')} value={newTagName} onChange={e => setNewTagName(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('git.tag.message')} (optional)</Label>
                  <Textarea
                    placeholder={t('git.tag.messagePlaceholder')}
                    value={newTagMessage}
                    onChange={e => setNewTagMessage(e.target.value)}
                    rows={2}
                    className="min-h-[60px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant={buttonVariant} size="sm" onClick={handleCreateTag} disabled={isCreating || !newTagName.trim()}>
                    {isCreating ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />}
                    {t('git.tag.create')}
                  </Button>
                  <Button variant={buttonVariant} size="sm" onClick={() => setShowCreateForm(false)}>
                    {t('git.tag.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant={buttonVariant} size="sm" onClick={() => setShowCreateForm(true)} className="w-full">
                <Plus className="h-3 w-3 mr-2" />
                {t('git.tag.createNew')}
              </Button>
            )}

            <div className="space-y-1.5 flex flex-col">
              <Label className="text-sm flex-shrink-0">{t('git.tag.localTags')}</Label>
              {isLoading ? (
                <div className="flex items-center justify-center py-6 flex-shrink-0">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tags.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-md text-sm flex-shrink-0">
                  <Tag className="h-10 w-10 mx-auto mb-1 opacity-50" />
                  <p>{t('git.tag.noTags')}</p>
                </div>
              ) : (
                <div className="h-[180px] overflow-y-auto overflow-x-hidden border rounded-md">
                  <div className="p-2 space-y-1">
                    {tags.map(tag => {
                      const isOnRemote = remoteTagsSet.has(tag)
                      return (
                        <div key={tag} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group">
                          <span className="text-sm font-mono truncate flex-1 min-w-0">{tag}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                              isOnRemote ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}
                            title={isOnRemote ? t('git.tag.onRemote') : t('git.tag.localOnly')}
                          >
                            {isOnRemote ? <Check className="h-3 w-3 inline mr-0.5 align-middle" /> : null}
                            {isOnRemote ? t('git.tag.onRemote') : t('git.tag.localOnly')}
                          </span>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              size="icon"
                              variant={buttonVariant}
                              className="h-7 w-7"
                              onClick={() => handlePushTag(tag)}
                              disabled={operatingTag === tag || isOnRemote}
                              title={isOnRemote ? t('git.tag.alreadyOnRemote') : t('git.tag.pushToRemote')}
                            >
                              {operatingTag === tag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteTagClick(tag)}
                              disabled={operatingTag === tag}
                              title={t('git.tag.delete')}
                            >
                              {operatingTag === tag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {!isLoading && remoteOnlyTags.length > 0 && (
              <div className="space-y-1.5 flex flex-col">
                <Label className="text-sm flex-shrink-0 flex items-center gap-1">
                  <Server className="h-3.5 w-3.5" />
                  {t('git.tag.remoteOnlyTags')}
                </Label>
                <div className="h-[120px] overflow-y-auto overflow-x-hidden border rounded-md">
                  <div className="p-2 space-y-1">
                    {remoteOnlyTags.map(tag => (
                      <div key={tag} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
                        <span className="text-sm font-mono truncate flex-1 min-w-0 text-muted-foreground">{tag}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{t('git.tag.remoteOnly')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
    </div>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('git.tag.title')}
            </DialogTitle>
            <DialogDescription>{t('git.tag.description')}</DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            {reposLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : repos.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">{t('settings.versioncontrol.selectRepoNoGitRepos', 'Không có repo Git.')}</div>
            ) : repos.length === 1 ? (
              renderContent()
            ) : (
              <Tabs value={selectedRepo?.path ?? repos[0]?.path ?? ''} onValueChange={v => setSelectedRepo(repos.find(r => r.path === v) ?? null)}>
                <TabsList className="w-full flex-wrap h-auto gap-1">
                  {repos.map(r => (
                    <TabsTrigger key={r.path} value={r.path} className="text-xs truncate max-w-[140px]">
                      {r.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value={selectedRepo?.path ?? repos[0]?.path ?? ''} className="mt-4 space-y-3">
                  {renderContent()}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={open => {
          setDeleteConfirmOpen(open)
          if (!open) setTagToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.tag.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.tag.deleteConfirm', { tag: tagToDelete || '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTagConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
