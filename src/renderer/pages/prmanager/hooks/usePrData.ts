import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export interface PrRepo {
  id: string
  projectId: string
  name: string
  localPath: string | null
  remoteUrl: string
  hosting: string
  owner: string
  repo: string
  defaultBaseBranch: string | null
}

export interface PrCheckpointTemplate {
  id: string
  projectId: string
  code: string
  label: string
  targetBranch: string | null
  sortOrder: number
  isActive: boolean
  /** 0-9: nhóm màu header cột PR Board; null = mặc định. */
  headerGroupId: number | null
}

export interface PrBranchCheckpoint {
  id: string
  trackedBranchId: string
  templateId: string
  isDone: boolean
  prNumber: number | null
  prUrl: string | null
  mergedAt: string | null
  mergedBy: string | null
  ghPrDraft: boolean | null
  ghPrState: 'open' | 'closed' | null
  ghPrMerged: boolean | null
  /** GitHub: login ng\u01b0\u1eddi t\u1ea1o PR. */
  ghPrAuthor: string | null
  /** Ti\u00eau \u0111\u1ec1 PR t\u1eeb GitHub. */
  ghPrTitle: string | null
  /** updated_at t\u1eeb GitHub API (ISO). */
  ghPrUpdatedAt: string | null
  /** Ch\u1ec9 c\u00f3 khi sync qua getPR. */
  ghPrAdditions: number | null
  ghPrDeletions: number | null
  ghPrChangedFiles: number | null
  ghPrMergeableState: string | null
  ghPrAssignees: Array<{ login: string; id: number; avatarUrl?: string | null }> | null
  ghPrLabels: Array<{ name: string; color: string }> | null
  updatedAt: string
}

export interface TrackedBranchRow {
  id: string
  projectId: string
  repoId: string
  branchName: string
  assigneeUserId: string | null
  note: string | null
  repoName: string
  repoOwner: string
  repoRepo: string
  assigneeName: string | null
  checkpoints: PrBranchCheckpoint[]
}

export interface PrAutomation {
  id: string
  repoId: string
  name: string | null
  triggerEvent: string
  sourcePattern: string | null
  targetBranch: string | null
  action: string
  nextTarget: string | null
  prTitleTemplate: string | null
  prBodyTemplate: string | null
  isActive: boolean
}

export interface PrDataState {
  loading: boolean
  repos: PrRepo[]
  templates: PrCheckpointTemplate[]
  tracked: TrackedBranchRow[]
  automations: PrAutomation[]
  tokenStatus: { ok: boolean; login?: string; message?: string } | null
  refresh: () => Promise<void>
  refreshTracked: () => Promise<void>
  refreshAutomations: () => Promise<void>
  refreshToken: () => Promise<void>
}

export function usePrData(projectId: string | null): PrDataState {
  const [loading, setLoading] = useState(false)
  const [repos, setRepos] = useState<PrRepo[]>([])
  const [templates, setTemplates] = useState<PrCheckpointTemplate[]>([])
  const [tracked, setTracked] = useState<TrackedBranchRow[]>([])
  const [automations, setAutomations] = useState<PrAutomation[]>([])
  const [tokenStatus, setTokenStatus] = useState<{ ok: boolean; login?: string; message?: string } | null>(null)
  const abortRef = useRef(0)

  const refreshToken = useCallback(async () => {
    const res = await window.api.pr.tokenCheck()
    setTokenStatus({ ok: res.status === 'success', login: res.login, message: res.message })
  }, [])

  const refreshTracked = useCallback(async () => {
    if (!projectId) return
    const res = await window.api.pr.trackedList(projectId)
    if (res.status === 'success' && res.data) setTracked(res.data as TrackedBranchRow[])
  }, [projectId])

  const refreshAutomations = useCallback(async () => {
    const res = await window.api.pr.automationList()
    if (res.status === 'success' && res.data) setAutomations(res.data as PrAutomation[])
  }, [])

  const refresh = useCallback(async () => {
    if (!projectId) return
    const ticket = ++abortRef.current
    setLoading(true)
    try {
      const [rRepos, rTpl, rTr, rAuto] = await Promise.all([
        window.api.pr.repoList(projectId),
        window.api.pr.templateList(projectId),
        window.api.pr.trackedList(projectId),
        window.api.pr.automationList(),
      ])
      if (ticket !== abortRef.current) return
      if (rRepos.status === 'success' && rRepos.data) setRepos(rRepos.data as PrRepo[])
      if (rTpl.status === 'success' && rTpl.data) setTemplates(rTpl.data as PrCheckpointTemplate[])
      if (rTr.status === 'success' && rTr.data) setTracked(rTr.data as TrackedBranchRow[])
      if (rAuto.status === 'success' && rAuto.data) setAutomations(rAuto.data as PrAutomation[])
    } finally {
      if (ticket === abortRef.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refresh()
    refreshToken()
  }, [refresh, refreshToken])

  useEffect(() => {
    const off1 = window.api.pr.onCheckpointUpdated(() => {
      refreshTracked()
    })
    const off2 = window.api.pr.onAutomationFired(() => {
      refreshTracked()
    })
    const off3 = window.api.pr.onTokenInvalid(payload => {
      setTokenStatus({ ok: false, message: payload.message })
      toast.error(payload.message, { id: 'pr-token-invalid' })
    })
    return () => {
      off1()
      off2()
      off3()
    }
  }, [refreshTracked])

  return { loading, repos, templates, tracked, automations, tokenStatus, refresh, refreshTracked, refreshAutomations, refreshToken }
}
