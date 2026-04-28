'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import toast from '@/components/ui-elements/Toast'
import {
  hydratePrBoardSkippedBranchesFromApi,
  readSkippedBranchesSnapshotText,
  writeSkippedBranchesSnapshotCache,
} from '../prBoardSkippedBranches'

type Props = {
  projectId: string
  userId: string | null
}

export function SkippedBranchesTab({ projectId, userId }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!userId?.trim()) {
        setDraft('')
        setSaved('')
        setLoading(false)
        return
      }
      setLoading(true)
      await hydratePrBoardSkippedBranchesFromApi(userId, projectId)
      if (cancelled) return
      const text = readSkippedBranchesSnapshotText(projectId, userId)
      setDraft(text)
      setSaved(text)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, userId])

  const dirty = draft !== saved

  const handleSave = async () => {
    if (!userId?.trim()) return
    const uid = userId.trim()
    setLoading(true)
    try {
      const res = await window.api.pr.boardSkipBranchesSet(uid, projectId, draft.split(/\r?\n/))
      if (res.status !== 'success') {
        toast.error(res.message ?? t('prManager.shell.skippedBranchesSaveError'))
        return
      }
      writeSkippedBranchesSnapshotCache(projectId, uid, draft.split(/\r?\n/))
      setSaved(draft)
    } finally {
      setLoading(false)
    }
  }

  const needLogin = !userId?.trim()

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor="pr-skipped-branches">{t('prManager.shell.skippedBranchesLabel')}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('prManager.shell.skippedBranchesHint')}</p>
        {needLogin ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">{t('prManager.shell.skippedBranchesNeedLogin')}</p>
        ) : null}
        <Textarea
          id="pr-skipped-branches"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('prManager.shell.skippedBranchesPlaceholder')}
          className="min-h-[140px] font-mono text-sm"
          spellCheck={false}
          disabled={loading || needLogin}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!dirty || loading || needLogin}>
          {t('prManager.shell.skippedBranchesSave')}
        </Button>
      </div>
    </div>
  )
}
