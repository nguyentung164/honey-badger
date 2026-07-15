import { DiffEditor } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiRepairProposal } from 'shared/automation/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from '@/components/ui-elements/Toast'
import { onAppMonacoDiffBeforeMount, useGlobalAppMonacoThemeSync } from '@/hooks/useAppMonacoTheme'

interface Props {
  caseResultId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onApplied?: () => void
}

export function AiRepairDialog({ caseResultId, open, onOpenChange, onApplied }: Props) {
  const { t } = useTranslation()
  const monacoTheme = useGlobalAppMonacoThemeSync({ includeDiff: true, includeEditorRules: false })
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [proposal, setProposal] = useState<AiRepairProposal | null>(null)

  useEffect(() => {
    if (!open || !caseResultId) return
    setProposal(null)
    setLoading(true)
    void window.api.automation.ai
      .repair({ caseResultId })
      .then(res => {
        if (res.status === 'success' && res.data) setProposal(res.data)
        else toast.error(res.message ?? 'AI repair failed')
      })
      .finally(() => setLoading(false))
  }, [open, caseResultId])

  const handleApply = async () => {
    if (!proposal) return
    setWorking(true)
    try {
      const res = await window.api.automation.ai.repairApply({ proposalId: proposal.id })
      if (res.status === 'success') {
        toast.success(t('automation.repair.applied'))
        onApplied?.()
        onOpenChange(false)
      } else {
        toast.error(res.message ?? 'Apply failed')
      }
    } finally {
      setWorking(false)
    }
  }

  const handleReject = async () => {
    if (!proposal) return
    setWorking(true)
    try {
      const res = await window.api.automation.ai.repairReject({ proposalId: proposal.id })
      if (res.status === 'success') {
        toast.info(t('automation.repair.rejected'))
        onOpenChange(false)
      } else {
        toast.error(res.message ?? 'Reject failed')
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl!">
        <DialogHeader>
          <DialogTitle>{t('automation.repair.title')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : proposal ? (
          <div className="flex flex-col gap-3">
            {proposal.rationale ? (
              <div className="rounded-md border bg-muted/40 p-2 text-xs">{proposal.rationale}</div>
            ) : null}
            <div className="h-[55vh] overflow-hidden rounded-md border">
              <DiffEditor
                original={proposal.originalSpec}
                modified={proposal.proposedSpec}
                language="typescript"
                theme={monacoTheme}
                beforeMount={onAppMonacoDiffBeforeMount}
                options={{ renderSideBySide: true, readOnly: true, minimap: { enabled: false } }}
              />
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('automation.repair.empty')}</div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
            {t('automation.common.close')}
          </Button>
          {proposal && proposal.status === 'pending' ? (
            <>
              <Button variant="outline" onClick={handleReject} disabled={working}>
                {t('automation.common.reject')}
              </Button>
              <Button onClick={handleApply} disabled={working}>
                {working ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('automation.repair.apply')}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
