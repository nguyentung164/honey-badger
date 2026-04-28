import { ipcMain, shell } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getLocalPrMergeConflicts } from '../git/prMergeConflicts'
import { getGitInstance } from '../git/utils'
import { getRemotes as gitGetRemotes } from '../git/remote'
import {
  getGithubToken,
  githubClient,
  createPullRequestIssueComment,
  createPullRequestReviewApproval,
  fetchGithubRestRateLimit,
  githubDeleteRemoteBranch,
  githubListRefCommitMessages,
  markPullRequestReadyForReview,
  markPullRequestAsDraft,
  closePullRequest,
  listRepositoryAssignees,
  reopenPullRequest,
  requestPullRequestReviewers,
  updatePullRequestBranch,
  listPullRequestFiles,
  listPullRequestConversation,
  githubRemoteBranchesExistenceAndProtectionMap,
  hasGithubToken,
  parseRemoteUrl,
  removeGithubToken,
  resetGithubClient,
  setGithubToken,
  testGithubToken,
} from '../git-hosting'
import type { PullRequestSummary } from '../git-hosting/types'
import { applyPullRequestToCheckpoints, onPrMerged, syncPullRequestIntoTrackedCheckpoints } from '../pr-automation/engine'
import { getSourceFoldersByProject } from '../task/mysqlTaskStore'
import type { PrAiAssistChatLineJson } from '../task/mysqlPrTrackingStore'
import { computeTrackedIdsNotOnRemote } from './prTrackedPruneRemote'
import {
  deleteCheckpointTemplate,
  deleteAutomation,
  deletePrRepo,
  deleteTrackedBranch,
  deleteTrackedBranchesByIds,
  getPrBoardSkippedBranchPatterns,
  getPrAiAssistChatLines,
  upsertPrAiAssistChatLines,
  getPrRepoById,
  getTrackedBranchById,
  listAutomations,
  listCheckpointTemplates,
  listPrRepos,
  listTrackedBranches,
  reorderCheckpointTemplates,
  seedDefaultCheckpointTemplates,
  setAutomationActive,
  upsertAutomation,
  upsertCheckpointTemplate,
  upsertPrBoardSkippedBranchPatterns,
  upsertPrRepo,
  upsertTrackedBranch,
  updateTrackedBranchNote,
} from '../task/mysqlPrTrackingStore'
import { hasDbConfig } from '../task/db'
import { detectVersionControl } from '../utils/versionControlDetector'
import { analyzePrFileOverlap } from '../prFileOverlap'

function errResp(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  l.error('PR IPC error:', msg)
  return { status: 'error' as const, message: msg }
}

async function afterPrMutateSyncCheckpoints(
  owner: string,
  repo: string,
  pr: PullRequestSummary,
  label: string
): Promise<void> {
  try {
    await syncPullRequestIntoTrackedCheckpoints(owner, repo, pr)
  } catch (err) {
    l.warn(`${label}: syncPullRequestIntoTrackedCheckpoints failed:`, err)
  }
}

async function runInBatches<T>(items: T[], batchSize: number, worker: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(worker))
  }
}

export function registerPrIpcHandlers(): void {
  l.info('Registering PR Manager IPC Handlers...')

  // ========== Token ==========
  ipcMain.handle(IPC.PR.TOKEN_SET, async (_e, token: string) => {
    const res = setGithubToken(token)
    if (res.success) {
      resetGithubClient()
      const test = await testGithubToken()
      return { status: test.ok ? 'success' : 'error', login: test.login, message: test.error }
    }
    return { status: 'error', message: res.error }
  })

  ipcMain.handle(IPC.PR.TOKEN_CHECK, async () => {
    if (!hasGithubToken()) return { status: 'error', message: 'No token configured' }
    const test = await testGithubToken()
    return { status: test.ok ? 'success' : 'error', login: test.login, message: test.error }
  })

  ipcMain.handle(IPC.PR.TOKEN_REMOVE, async () => {
    removeGithubToken()
    resetGithubClient()
    return { status: 'success' }
  })

  ipcMain.handle(IPC.PR.RATE_LIMIT_GET, async () => {
    try {
      if (!getGithubToken()) {
        return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
      }
      const data = await fetchGithubRestRateLimit()
      return { status: 'success' as const, data }
    } catch (err) {
      return errResp(err)
    }
  })

  // ========== Repos ==========
  ipcMain.handle(IPC.PR.REPO_LIST, async (_e, userId: string, projectId: string) => {
    try {
      const list = await listPrRepos(userId, projectId)
      return { status: 'success', data: list }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.REPO_UPSERT,
    async (
      _e,
      input: {
        id?: string
        userId: string
        projectId: string
        name: string
        localPath?: string | null
        remoteUrl: string
        defaultBaseBranch?: string | null
      },
    ) => {
      try {
        const parsed = parseRemoteUrl(input.remoteUrl)
        if (!parsed) {
          return { status: 'error', message: 'Remote URL kh\u00f4ng h\u1ee3p l\u1ec7 (ch\u1ec9 h\u1ed7 tr\u1ee3 GitHub).' }
        }
        const row = await upsertPrRepo({
          id: input.id,
          userId: input.userId,
          projectId: input.projectId,
          name: input.name,
          localPath: input.localPath ?? null,
          remoteUrl: input.remoteUrl,
          hosting: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
          defaultBaseBranch: input.defaultBaseBranch ?? 'stage',
        })
        return { status: 'success', data: row }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  ipcMain.handle(IPC.PR.REPO_REMOVE, async (_e, userId: string, id: string) => {
    try {
      await deletePrRepo(userId, id)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.REPO_AUTODETECT, async (_e, userId: string, projectId: string) => {
    try {
      const folders = await getSourceFoldersByProject(userId, projectId)
      const added: Array<{ name: string; owner: string; repo: string; path: string }> = []
      const skipped: Array<{ path: string; reason: string }> = []
      for (const folder of folders) {
        const det = await detectVersionControl(folder.path)
        if (det.type !== 'git' || !det.isValid) {
          skipped.push({ path: folder.path, reason: 'Not a git repository' })
          continue
        }
        const remotes = await gitGetRemotes(folder.path)
        const list = (remotes.data ?? []) as Array<{ name: string; refs: { fetch?: string; push?: string } }>
        const origin = list.find(r => r.name === 'origin') ?? list[0]
        const url = origin?.refs?.fetch || origin?.refs?.push
        if (!url) {
          skipped.push({ path: folder.path, reason: 'No remote URL' })
          continue
        }
        const parsed = parseRemoteUrl(url)
        if (!parsed) {
          skipped.push({ path: folder.path, reason: 'Not a GitHub remote' })
          continue
        }
        await upsertPrRepo({
          userId,
          projectId,
          name: folder.name,
          localPath: folder.path,
          remoteUrl: url,
          hosting: 'github',
          owner: parsed.owner,
          repo: parsed.repo,
          defaultBaseBranch: 'stage',
        })
        added.push({ name: folder.name, owner: parsed.owner, repo: parsed.repo, path: folder.path })
      }
      return { status: 'success', data: { added, skipped } }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.BOARD_SKIP_BRANCHES_GET, async (_e, userId: string, projectId: string) => {
    try {
      if (!hasDbConfig()) return { status: 'error' as const, message: 'Task database not configured.' }
      const uid = typeof userId === 'string' ? userId.trim() : ''
      if (!uid) return { status: 'error' as const, message: 'User ID required.' }
      const pid = typeof projectId === 'string' ? projectId.trim() : ''
      if (!pid) return { status: 'error' as const, message: 'Project ID required.' }
      const lines = await getPrBoardSkippedBranchPatterns(uid, pid)
      return { status: 'success' as const, data: { lines } }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.BOARD_SKIP_BRANCHES_SET, async (_e, userId: string, projectId: string, lines: unknown) => {
    try {
      if (!hasDbConfig()) return { status: 'error' as const, message: 'Task database not configured.' }
      const uid = typeof userId === 'string' ? userId.trim() : ''
      if (!uid) return { status: 'error' as const, message: 'User ID required.' }
      const pid = typeof projectId === 'string' ? projectId.trim() : ''
      if (!pid) return { status: 'error' as const, message: 'Project ID required.' }
      const raw = Array.isArray(lines) ? lines : []
      const asStrings = raw.map(l => String(l ?? ''))
      await upsertPrBoardSkippedBranchPatterns(uid, pid, asStrings)
      return { status: 'success' as const }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.AI_ASSIST_CHAT_GET, async (_e, userId: string, projectId: string) => {
    try {
      if (!hasDbConfig()) return { status: 'error' as const, message: 'Task database not configured.' }
      const uid = typeof userId === 'string' ? userId.trim() : ''
      if (!uid) return { status: 'error' as const, message: 'User ID required.' }
      const pid = typeof projectId === 'string' ? projectId.trim() : ''
      if (!pid) return { status: 'error' as const, message: 'Project ID required.' }
      const lines = await getPrAiAssistChatLines(uid, pid)
      return { status: 'success' as const, data: { lines } }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.AI_ASSIST_CHAT_SAVE,
    async (_e, payload: { userId: string; projectId: string; lines: PrAiAssistChatLineJson[] }) => {
      try {
        if (!hasDbConfig()) return { status: 'error' as const, message: 'Task database not configured.' }
        const uid = typeof payload?.userId === 'string' ? payload.userId.trim() : ''
        if (!uid) return { status: 'error' as const, message: 'User ID required.' }
        const pid = typeof payload?.projectId === 'string' ? payload.projectId.trim() : ''
        if (!pid) return { status: 'error' as const, message: 'Project ID required.' }
        const raw = Array.isArray(payload?.lines) ? payload.lines : []
        await upsertPrAiAssistChatLines(uid, pid, raw as PrAiAssistChatLineJson[])
        return { status: 'success' as const }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  // ========== Templates ==========
  ipcMain.handle(IPC.PR.TEMPLATE_LIST, async (_e, userId: string, projectId: string) => {
    try {
      const list = await listCheckpointTemplates(userId, projectId)
      return { status: 'success', data: list }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.TEMPLATE_UPSERT,
    async (
      _e,
      input: {
        id?: string
        userId: string
        projectId: string
        code: string
        label: string
        targetBranch?: string | null
        sortOrder?: number
        isActive?: boolean
        headerGroupId?: number | null
      },
    ) => {
      try {
        const row = await upsertCheckpointTemplate(input)
        return { status: 'success', data: row }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  ipcMain.handle(IPC.PR.TEMPLATE_DELETE, async (_e, userId: string, id: string) => {
    try {
      await deleteCheckpointTemplate(userId, id)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.TEMPLATE_REORDER, async (_e, userId: string, projectId: string, orderedIds: string[]) => {
    try {
      await reorderCheckpointTemplates(userId, projectId, orderedIds)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.TEMPLATE_SEED_DEFAULT, async (_e, userId: string, projectId: string) => {
    try {
      await seedDefaultCheckpointTemplates(userId, projectId)
      const list = await listCheckpointTemplates(userId, projectId)
      return { status: 'success', data: list }
    } catch (err) {
      return errResp(err)
    }
  })

  // ========== Tracked Branches ==========
  ipcMain.handle(IPC.PR.TRACKED_LIST, async (_e, userId: string, projectId: string) => {
    try {
      const list = await listTrackedBranches(userId, projectId)
      return { status: 'success', data: list }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.TRACKED_UPSERT,
    async (
      _e,
      input: {
        id?: string
        userId: string
        projectId: string
        repoId: string
        branchName: string
        note?: string | null
      },
    ) => {
      try {
        const row = await upsertTrackedBranch(input)
        return { status: 'success', data: row }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  ipcMain.handle(
    IPC.PR.TRACKED_UPDATE_NOTE,
    async (_e, id: string, patch: { note?: string | null }) => {
      try {
        await updateTrackedBranchNote(id, patch)
        return { status: 'success' }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(IPC.PR.TRACKED_DELETE, async (_e, id: string) => {
    try {
      await deleteTrackedBranch(id)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  // ========== Sync PRs from GitHub (open + closed/merged) ==========
  ipcMain.handle(
    IPC.PR.TRACKED_SYNC_FROM_GITHUB,
    async (
      e,
      arg0:
        | string
        | { userId: string; projectId: string; syncScope?: { repoId?: string; trackedBranchId?: string } },
      arg1?: string,
      arg2?: { repoId?: string; trackedBranchId?: string },
    ) => {
      let userId: string
      let projectId: string
      let options: { repoId?: string; trackedBranchId?: string } | undefined
      if (typeof arg0 === 'object' && arg0 !== null && 'userId' in arg0 && 'projectId' in arg0) {
        userId = arg0.userId
        projectId = arg0.projectId
        options = arg0.syncScope
      } else if (typeof arg0 === 'string' && typeof arg1 === 'string') {
        userId = arg0
        projectId = arg1
        options = arg2
      } else {
        return { status: 'error', message: 'Invalid GitHub sync request.' }
      }
      try {
      if (!getGithubToken()) {
        return { status: 'error', message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
      }
      const uid = typeof userId === 'string' ? userId.trim() : ''
      if (!uid) return { status: 'error', message: 'User ID required.' }
      const repos = await listPrRepos(uid, projectId)
      const templates = await listCheckpointTemplates(uid, projectId)
      const trackedRows = await listTrackedBranches(uid, projectId)
      const optRepoId = typeof options?.repoId === 'string' ? options.repoId.trim() : ''
      const optTrackedBranchId = typeof options?.trackedBranchId === 'string' ? options.trackedBranchId.trim() : ''
      let onlyBranchHead: string | null = null
      let reposToSync = repos
      if (optTrackedBranchId) {
        const row = trackedRows.find(r => r.id === optTrackedBranchId)
        if (!row) {
          return { status: 'error', message: 'Tracked branch not found.' }
        }
        onlyBranchHead = row.branchName.trim().toLowerCase()
        reposToSync = repos.filter(r => r.id === row.repoId)
        if (reposToSync.length === 0) {
          return { status: 'error', message: 'Repo not found for tracked branch.' }
        }
      } else if (optRepoId) {
        reposToSync = repos.filter(r => r.id === optRepoId)
        if (reposToSync.length === 0) {
          return { status: 'error', message: 'Repo not found.' }
        }
      }
      const prMatchesScope = (p: PullRequestSummary) =>
        !onlyBranchHead || p.head.trim().toLowerCase() === onlyBranchHead
      const perPage = 100
      const maxPages = 5
      /** S\u1ed1 repo x\u1eed l\u00fd song song (c\u00e2n b\u1eb1ng t\u1ed1c \u0111\u1ed9 / rate limit GitHub). */
      const repoSyncConcurrency = 3
      const branchUpsertConcurrency = 8
      const prDetailPrefetchConcurrency = 8
      const prApplyConcurrency = 8
      let branchesSynced = 0
      let synced = 0
      const errors: string[] = []
      const trackedBranchNamesByRepo = new Map<string, Set<string>>()
      for (const row of trackedRows) {
        const names = trackedBranchNamesByRepo.get(row.repoId) ?? new Set<string>()
        names.add(row.branchName.trim().toLowerCase())
        trackedBranchNamesByRepo.set(row.repoId, names)
      }
      const sendProgress = (done: number) => {
        e.sender.send(IPC.PR.EVENT_TRACKED_SYNC_PROGRESS, {
          projectId,
          done,
          total: reposToSync.length,
          percent: reposToSync.length === 0 ? 100 : Math.round((done / reposToSync.length) * 100),
        })
      }

      const pairKey = (head: string, base: string) => `${head.trim().toLowerCase()}\0${base.trim().toLowerCase()}`

      let reposDone = 0
      sendProgress(0)
      await runInBatches(reposToSync, Math.max(1, repoSyncConcurrency), async repo => {
        try {
          const existingBranchNames = trackedBranchNamesByRepo.get(repo.id) ?? new Set<string>()
          trackedBranchNamesByRepo.set(repo.id, existingBranchNames)

          const remoteBranchesPromise = githubClient.listBranches(repo.owner, repo.repo)
          const bestPullRequestsPromise = (async () => {
            const best = new Map<string, PullRequestSummary>()
            const pages = await Promise.all(
              Array.from({ length: maxPages }, (_, i) =>
                githubClient
                  .listPRs({
                    owner: repo.owner,
                    repo: repo.repo,
                    state: 'all',
                    perPage,
                    page: i + 1,
                  })
                  .catch((): PullRequestSummary[] => [])
              )
            )
            for (const batch of pages) {
              for (const pr of batch) {
                const k = pairKey(pr.head, pr.base)
                const ex = best.get(k)
                if (!ex) {
                  best.set(k, pr)
                } else {
                  const tNew = new Date(pr.updatedAt).getTime()
                  const tOld = new Date(ex.updatedAt).getTime()
                  if (tNew > tOld) best.set(k, pr)
                }
              }
            }
            return best
          })()

          const [remoteBranches, best] = await Promise.all([remoteBranchesPromise, bestPullRequestsPromise])
          const remoteBranchNormSet = new Set(
            remoteBranches.map(n => n.trim().toLowerCase()).filter(Boolean),
          )
          const newRemoteBranches = remoteBranches
            .map(branchName => branchName.trim())
            .filter(branchName => {
              const normalizedKey = branchName.toLowerCase()
              /** Không bỏ qua main/stage theo template — người dùng vẫn cần track các nhánh merge base trên remote. Chỉ tránh trùng bản ghi đã track. */
              return Boolean(branchName) && !existingBranchNames.has(normalizedKey)
            })

          if (!onlyBranchHead) {
            await runInBatches(newRemoteBranches, branchUpsertConcurrency, async branchName => {
              const normalizedKey = branchName.toLowerCase()
              if (existingBranchNames.has(normalizedKey)) return
              await upsertTrackedBranch({
                userId: uid,
                projectId,
                repoId: repo.id,
                branchName,
              })
              existingBranchNames.add(normalizedKey)
              branchesSynced++
            })
          }

          /** Chỉ getPR/apply PR cho nhánh đang track và ref vẫn còn trên remote (tránh call API cho branch đã xóa/ghi nhầm list PR). */
          const syncPrFilter = (p: PullRequestSummary) => {
            if (!prMatchesScope(p)) return false
            const headNorm = p.head.trim().toLowerCase()
            if (!existingBranchNames.has(headNorm)) return false
            if (!remoteBranchNormSet.has(headNorm)) return false
            return true
          }

          // GET each PR before apply: pulls.list can lag behind GET /pulls/{n} right after merge/close; list-only was overwriting fresh checkpoints.
          const scopeEntries = [...best.entries()].filter(([, p]) => syncPrFilter(p))
          const CONC = prDetailPrefetchConcurrency
          for (let i = 0; i < scopeEntries.length; i += CONC) {
            const slice = scopeEntries.slice(i, i + CONC)
            await Promise.all(
              slice.map(async ([key, basePr]) => {
                try {
                  const detailed = await githubClient.getPR(repo.owner, repo.repo, basePr.number, {
                    includeReviewSubmissions: false,
                  })
                  best.set(key, detailed)
                } catch {
                  // getPR l\u1ed7i \u2192 gi\u1eef d\u1eef li\u1ec7u list
                }
              })
            )
          }

          await runInBatches([...best.values()].filter(syncPrFilter), prApplyConcurrency, async pr => {
            try {
              await applyPullRequestToCheckpoints({ projectId, repoId: repo.id, pr, templatesCache: templates })
              synced++
            } catch {
              // thi\u1ebfu template checkpoint \u2014 b\u1ecf qua
            }
          })
        } catch (err: any) {
          errors.push(`${repo.owner}/${repo.repo}: ${err?.message || err}`)
        } finally {
          reposDone += 1
          sendProgress(reposDone)
        }
      })
      return { status: 'success', data: { synced, branchesSynced, errors } }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  // ========== Prune tracked branches missing on GitHub remote ==========
  ipcMain.handle(
    IPC.PR.TRACKED_PRUNE_NOT_ON_GITHUB,
    async (
      _e,
      payload: { userId: string; projectId: string; dryRun: boolean },
    ) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token chưa cấu hình.' }
        }
        const uid = typeof payload?.userId === 'string' ? payload.userId.trim() : ''
        const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : ''
        const dryRun = Boolean(payload?.dryRun)
        if (!uid) return { status: 'error' as const, message: 'User ID required.' }
        if (!projectId) return { status: 'error' as const, message: 'Project ID required.' }

        const repos = await listPrRepos(uid, projectId)
        const tracked = await listTrackedBranches(uid, projectId)
        const trackedRows = tracked.map(t => ({
          id: t.id,
          repoId: t.repoId,
          branchName: t.branchName,
        }))
        const computed = await computeTrackedIdsNotOnRemote({
          repos,
          trackedRows,
          listRemoteBranchNames: (owner, repo) => githubClient.listBranches(owner, repo),
        })

        if (dryRun) {
          return {
            status: 'success' as const,
            data: {
              wouldDelete: computed.ids.length,
              preview: computed.preview,
              errors: computed.errors,
            },
          }
        }

        const deleted = await deleteTrackedBranchesByIds(computed.ids)
        return {
          status: 'success' as const,
          data: { deleted, errors: computed.errors },
        }
      } catch (err) {
        return errResp(err)
      }
    },
  )

  // ========== PR Operations ==========
  ipcMain.handle(
    IPC.PR.PR_CREATE,
    async (
      _e,
      input: {
        projectId: string
        repoId: string
        owner: string
        repo: string
        title: string
        body?: string
        head: string
        base: string
        draft?: boolean
        openInBrowser?: boolean
        userId: string
      },
    ) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error', message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const pr = await githubClient.createPR({
          owner: input.owner,
          repo: input.repo,
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base,
          draft: input.draft,
        })
        // PR \u0111\u00e3 t\u1ea1o th\u00e0nh c\u00f4ng \u2014 tracking kh\u00f4ng \u0111\u01b0\u1ee3c l\u00e0m fail c\u1ea3 request
        let trackingError: string | undefined
        try {
          await upsertTrackedBranch({
            userId: input.userId,
            projectId: input.projectId,
            repoId: input.repoId,
            branchName: input.head,
          })
          await applyPullRequestToCheckpoints({ projectId: input.projectId, repoId: input.repoId, pr })
        } catch (err) {
          trackingError = err instanceof Error ? err.message : String(err)
          l.warn('PR tracking upsert failed after successful create:', trackingError)
        }
        if (input.openInBrowser) {
          shell.openExternal(pr.htmlUrl).catch(() => {})
        }
        return { status: 'success' as const, data: pr, trackingError }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_MERGE,
    async (
      _e,
      input: {
        projectId: string
        repoId: string
        owner: string
        repo: string
        number: number
        method: 'squash' | 'merge' | 'rebase'
        commitTitle?: string
        commitMessage?: string
      }
    ) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error', message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const merged = await githubClient.mergePR({
          owner: input.owner,
          repo: input.repo,
          number: input.number,
          method: input.method,
          commitTitle: input.commitTitle,
          commitMessage: input.commitMessage,
        })
        if (merged.merged) {
          try {
            const pr = await githubClient.getPR(input.owner, input.repo, input.number)
            await onPrMerged({
              projectId: input.projectId,
              repoId: input.repoId,
              prNumber: input.number,
              sourceBranch: pr.head,
              targetBranch: pr.base,
              prTitle: pr.title,
              prUrl: pr.htmlUrl,
              github: { draft: pr.draft, state: pr.state, merged: pr.merged },
              prAuthor: pr.author ?? null,
              mergedAt: pr.mergedAt ?? new Date().toISOString(),
              mergedBy: pr.mergedBy ?? null,
            })
          } catch (err) {
            l.warn('Post-merge automation error:', err)
          }
        }
        return { status: 'success', data: merged }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_LIST,
    async (
      _e,
      input: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; base?: string; head?: string }
    ) => {
      try {
        const list = await githubClient.listPRs({
          owner: input.owner,
          repo: input.repo,
          state: input.state,
          base: input.base,
          head: input.head,
        })
        return { status: 'success', data: list }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_GET,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        const pr = await githubClient.getPR(input.owner, input.repo, input.number)
        return { status: 'success', data: pr }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_GET_COMMITS,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        const list = await githubClient.getPRCommits(input.owner, input.repo, input.number)
        return { status: 'success', data: list }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_LOCAL_MERGE_CONFLICTS,
    async (_e, input: { repoId: string; prNumber: number; base: string; headSha: string }) => {
      try {
        const prRepo = await getPrRepoById(input.repoId)
        const cwd = prRepo?.localPath?.trim()
        if (!cwd) {
          return {
            status: 'unavailable' as const,
            reason: 'noLocalPath' as const,
            message: 'Kho ch\u01b0a c\u00f3 \u0111\u01b0\u1eddng d\u1eabn c\u1ee5c b\u1ed9.',
          }
        }
        const b = (input.base || '').trim()
        const h = (input.headSha || '').trim()
        if (!b || !h) {
          return { status: 'unavailable' as const, reason: 'missing' as const, message: 'Thi\u1ebfu base ho\u1eb7c head SHA.' }
        }
        const data = await getLocalPrMergeConflicts(cwd, input.prNumber, b, h)
        return { status: 'success' as const, data }
      } catch (err) {
        return { status: 'error' as const, message: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_FILES_LIST,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await listPullRequestFiles(input.owner, input.repo, input.number)
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(IPC.PR.PR_FILE_OVERLAP, async (_e, input: { items: { owner: string; repo: string; number: number }[] }) => {
    try {
      if (!getGithubToken()) {
        return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
      }
      const items = Array.isArray(input?.items) ? input.items : []
      const data = await analyzePrFileOverlap(items)
      return { status: 'success' as const, data }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.PR_ISSUE_COMMENTS_LIST,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await listPullRequestConversation(input.owner, input.repo, input.number)
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_ISSUE_COMMENT_CREATE,
    async (_e, input: { owner: string; repo: string; number: number; body: string }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const b = (input.body ?? '').trim()
        if (!b) {
          return { status: 'error' as const, message: 'N\u1ed9i dung b\u00ecnh lu\u1eadn tr\u1ed1ng.' }
        }
        const data = await createPullRequestIssueComment(input.owner, input.repo, input.number, b)
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_REVIEW_APPROVE,
    async (_e, input: { owner: string; repo: string; number: number; headSha: string; body?: string }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await createPullRequestReviewApproval(
          input.owner,
          input.repo,
          input.number,
          input.headSha,
          input.body
        )
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_MARK_READY,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await markPullRequestReadyForReview(input.owner, input.repo, input.number)
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_MARK_READY')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_MARK_DRAFT,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await markPullRequestAsDraft(input.owner, input.repo, input.number)
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_MARK_DRAFT')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_CLOSE,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await closePullRequest(input.owner, input.repo, input.number)
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_CLOSE')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_REOPEN,
    async (_e, input: { owner: string; repo: string; number: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await reopenPullRequest(input.owner, input.repo, input.number)
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_REOPEN')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_REQUEST_REVIEWERS,
    async (_e, input: { owner: string; repo: string; number: number; reviewers: string[] }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await requestPullRequestReviewers(
          input.owner,
          input.repo,
          input.number,
          Array.isArray(input.reviewers) ? input.reviewers : []
        )
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_REQUEST_REVIEWERS')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.REPO_LIST_ASSIGNEES,
    async (_e, input: { owner: string; repo: string }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await listRepositoryAssignees(input.owner, input.repo)
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.PR_UPDATE_BRANCH,
    async (_e, input: { owner: string; repo: string; number: number; expectedHeadSha?: string | null }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const data = await updatePullRequestBranch(
          input.owner,
          input.repo,
          input.number,
          input.expectedHeadSha ?? undefined
        )
        await afterPrMutateSyncCheckpoints(input.owner, input.repo, data, 'PR_UPDATE_BRANCH')
        return { status: 'success' as const, data }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.BRANCH_LIST_REMOTE,
    async (_e, input: { owner: string; repo: string }) => {
      try {
        const list = await githubClient.listBranches(input.owner, input.repo)
        return { status: 'success', data: list }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.GITHUB_REMOTE_BRANCHES_EXIST,
    async (_e, items: { id: string; owner: string; repo: string; branch: string }[]) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        if (!Array.isArray(items) || items.length === 0) {
          return {
            status: 'success' as const,
            data: { existence: {} as Record<string, boolean>, branchProtected: {} as Record<string, boolean> },
          }
        }
        const out = await githubRemoteBranchesExistenceAndProtectionMap(items)
        return { status: 'success' as const, data: out }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.GITHUB_DELETE_REMOTE_BRANCH,
    async (
      _e,
      input: { owner: string; repo: string; branch: string; repoId: string; trackedBranchId?: string },
    ) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const prRepo = await getPrRepoById(input.repoId)
        await githubDeleteRemoteBranch(input.owner, input.repo, input.branch, {
          defaultBaseBranch: prRepo?.defaultBaseBranch ?? null,
        })
        const tid = typeof input.trackedBranchId === 'string' ? input.trackedBranchId.trim() : ''
        if (tid) {
          const tb = await getTrackedBranchById(tid)
          const repoId = typeof input.repoId === 'string' ? input.repoId.trim() : ''
          const branchNorm = input.branch?.trim().toLowerCase() ?? ''
          const repoOk = tb !== null && tb.repoId === repoId
          const branchOk = tb !== null && tb.branchName.trim().toLowerCase() === branchNorm
          if (repoOk && branchOk) {
            await deleteTrackedBranch(tid)
          } else {
            l.warn('GITHUB_DELETE_REMOTE_BRANCH: skipped DB delete — trackedBranchId mismatch or unknown row', {
              tid,
              repoOk,
              branchOk,
            })
          }
        }
        return { status: 'success' as const }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.REF_COMMIT_MESSAGES,
    async (_e, input: { owner: string; repo: string; ref: string; maxCommits?: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token ch\u01b0a c\u1ea5u h\u00ecnh.' }
        }
        const list = await githubListRefCommitMessages(
          input.owner,
          input.repo,
          input.ref,
          input.maxCommits ?? 500
        )
        return { status: 'success' as const, data: list }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.BRANCH_LAST_COMMIT_MESSAGE,
    async (_e, input: { owner: string; repo: string; branch: string }) => {
      try {
        const msg = await githubClient.getLatestCommitMessage(input.owner, input.repo, input.branch)
        return { status: 'success', data: msg }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(
    IPC.PR.LOCAL_LAST_COMMIT_MESSAGE,
    async (_e, input: { cwd: string; branch?: string }) => {
      try {
        const git = await getGitInstance(input.cwd)
        if (!git) return { status: 'error', message: 'Not a git repository' }
        const log = await git.log({ maxCount: 1, ...(input.branch ? { from: input.branch } : {}) } as any)
        const latest = log.latest
        return { status: 'success', data: latest?.message ?? null }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  // ========== Branch log + destructive ops (reset --hard / push --force) ==========
  ipcMain.handle(
    IPC.PR.BRANCH_COMMITS,
    async (_e, input: { owner: string; repo: string; branch: string; perPage?: number }) => {
      try {
        if (!getGithubToken()) {
          return { status: 'error' as const, message: 'GitHub token chưa cấu hình.' }
        }
        const list = await githubClient.listBranchCommits(
          input.owner,
          input.repo,
          input.branch,
          input.perPage ?? 50
        )
        return { status: 'success' as const, data: list }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  /**
   * Auto: fetch --all --prune → checkout <branch> (tạo local tracking nếu chưa có)
   *   → reset --hard <sha>.
   * Yêu cầu pr_repos.local_path phải tồn tại.
   */
  ipcMain.handle(
    IPC.PR.BRANCH_RESET_HARD,
    async (_e, input: { repoId: string; branch: string; sha: string }) => {
      try {
        const branch = input.branch?.trim()
        const sha = input.sha?.trim()
        if (!branch || !sha) return { status: 'error', message: 'Thiếu branch hoặc sha.' }
        const prRepo = await getPrRepoById(input.repoId)
        const cwd = prRepo?.localPath?.trim()
        if (!cwd) {
          return {
            status: 'error',
            message: 'Repo này chưa có đường dẫn local. Vào tab Repos để cấu hình local path.',
          }
        }
        const git = await getGitInstance(cwd)
        if (!git) return { status: 'error', message: 'Không khởi tạo được git ở local path.' }
        l.info(`PR branch reset-hard: ${cwd} branch=${branch} sha=${sha}`)
        try {
          await git.raw(['fetch', '--all', '--prune'])
        } catch (e) {
          l.warn('fetch all failed, tiếp tục:', (e as Error)?.message)
        }
        try {
          await git.raw(['checkout', branch])
        } catch {
          await git.raw(['checkout', '-B', branch, `origin/${branch}`])
        }
        await git.raw(['reset', '--hard', sha])
        return { status: 'success' as const, message: `Đã reset --hard ${sha.slice(0, 7)} trên nhánh ${branch}.` }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  /**
   * Auto: fetch + checkout <branch> → git push --force origin <branch>.
   */
  ipcMain.handle(
    IPC.PR.BRANCH_FORCE_PUSH,
    async (_e, input: { repoId: string; branch: string }) => {
      try {
        const branch = input.branch?.trim()
        if (!branch) return { status: 'error', message: 'Thiếu branch.' }
        const prRepo = await getPrRepoById(input.repoId)
        const cwd = prRepo?.localPath?.trim()
        if (!cwd) {
          return {
            status: 'error',
            message: 'Repo này chưa có đường dẫn local. Vào tab Repos để cấu hình local path.',
          }
        }
        const git = await getGitInstance(cwd)
        if (!git) return { status: 'error', message: 'Không khởi tạo được git ở local path.' }
        l.info(`PR branch force-push: ${cwd} branch=${branch}`)
        try {
          await git.raw(['fetch', 'origin', branch])
        } catch (e) {
          l.warn('fetch origin branch failed, tiếp tục:', (e as Error)?.message)
        }
        try {
          await git.raw(['checkout', branch])
        } catch {
          await git.raw(['checkout', '-B', branch, `origin/${branch}`])
        }
        await git.raw(['push', '--force', 'origin', branch])
        return { status: 'success' as const, message: `Đã push --force ${branch} lên origin.` }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  // ========== Automations ==========
  ipcMain.handle(IPC.PR.AUTOMATION_LIST, async (_e, userId: string, repoId?: string) => {
    try {
      const list = await listAutomations(userId, repoId)
      return { status: 'success', data: list }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(
    IPC.PR.AUTOMATION_UPSERT,
    async (
      _e,
      input: {
        id?: string
        repoId: string
        name?: string | null
        triggerEvent: string
        sourcePattern?: string | null
        targetBranch?: string | null
        action: string
        nextTarget?: string | null
        prTitleTemplate?: string | null
        prBodyTemplate?: string | null
        isActive?: boolean
      }
    ) => {
      try {
        const row = await upsertAutomation(input)
        return { status: 'success', data: row }
      } catch (err) {
        return errResp(err)
      }
    }
  )

  ipcMain.handle(IPC.PR.AUTOMATION_DELETE, async (_e, id: string) => {
    try {
      await deleteAutomation(id)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  ipcMain.handle(IPC.PR.AUTOMATION_TOGGLE, async (_e, id: string, isActive: boolean) => {
    try {
      await setAutomationActive(id, isActive)
      return { status: 'success' }
    } catch (err) {
      return errResp(err)
    }
  })

  l.info('PR Manager IPC Handlers registered')
}
