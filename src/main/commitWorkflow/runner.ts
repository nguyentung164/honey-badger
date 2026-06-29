import Store from 'electron-store'
import l from 'electron-log'
import { IPC } from 'main/constants'
import { getMainWindowRef } from '../mainWindowRef'
import type {
  CommitWorkflowRunStreamPayload,
  CommitWorkflowStartPayload,
  CommitWorkflowStepKind,
  CommitWorkflowStepStatus,
  CommitWorkflowStepStatusEntry,
} from 'shared/commitWorkflow/types'
import {
  DEFAULT_COMMIT_WORKFLOW_GRAPH,
  DEFAULT_COMMIT_WORKFLOW_SETTINGS,
  allStepNodeIds,
  nodeById,
} from 'shared/commitWorkflow/defaultWorkflow'
import { applyRunChoicesToGraph } from 'shared/commitWorkflow/applyRunChoices'
import { commitWorkflowNodeToSettings } from 'shared/commitWorkflow/nodeSettings'
import { hasDbConfig } from '../task/schema/db'
import { getProjectIdByUserAndPath } from '../task/stores/pgTaskStore'
import {
  compareCommitWorkflowRunsByStartedAtDesc,
  finalizeCommitWorkflowRun,
  findCommitWorkflowRunByCommit,
  getCommitWorkflowRun,
  insertCommitWorkflowRun,
  linkGitCommitQueueWorkflow,
  listCommitWorkflowRuns,
  markCommitWorkflowRunSuperseded,
  updateCommitWorkflowRunStatus,
  updateCommitWorkflowStep,
} from './db'
import { runCodingRulesStep } from './steps/codingRules'
import { runSpotbugsStep } from './steps/spotbugs'
import { runPlaywrightStep } from './steps/playwright'
import { enqueueSyncRun, scheduleSyncFlush } from './syncQueue'
import { notifyWorkflowFailure } from './notifications'

const COMMIT_WORKFLOW_CANCELLED = '__COMMIT_WORKFLOW_CANCELLED__'

type ActiveRun = {
  runId: string
  repoPath: string
  abort: AbortController
}

const activeByRepo = new Map<string, ActiveRun>()
/** In-memory authoritative run state during active lifecycle — avoids disk/DB read on every stream tick. */
const runMemory = new Map<string, NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>>>()
const localRuns = new Store<{ runs: Record<string, Awaited<ReturnType<typeof getCommitWorkflowRun>>> }>({
  name: 'commit-workflow-local',
  defaults: { runs: {} },
})

function getCachedRun(runId: string): NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>> | undefined {
  return runMemory.get(runId) ?? localRuns.get('runs')[runId] ?? undefined
}

function setCachedRun(run: NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>>): void {
  runMemory.set(run.id, run)
}

function persistRunToDisk(runId: string): void {
  const run = runMemory.get(runId)
  if (!run) return
  const runs = localRuns.get('runs')
  localRuns.set('runs', { ...runs, [runId]: run })
}

function broadcast(payload: CommitWorkflowRunStreamPayload): void {
  const main = getMainWindowRef()
  if (!main || main.isDestroyed()) return
  try {
    main.webContents.send(IPC.COMMIT_WORKFLOW.STREAM_RUN, payload)
  } catch {
    /* ignore */
  }
}

function buildStepStatus(run: NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>>): Record<string, CommitWorkflowStepStatusEntry> {
  const out: Record<string, CommitWorkflowStepStatusEntry> = {}
  for (const s of run.steps) {
    const node = nodeById(run.graphSnapshot, s.stepKey)
    out[s.stepKey] = {
      status: s.status,
      stepKind: s.stepKind,
      label: node?.data.label ?? s.stepKey,
      startedAt: s.startedAt ?? undefined,
      finishedAt: s.finishedAt ?? undefined,
      summary: s.summary,
      externalRef: s.externalRef ?? undefined,
    }
  }
  return out
}

function elapsedMs(startedAt: string | null): number | undefined {
  if (!startedAt) return undefined
  return Math.max(0, Date.now() - new Date(startedAt).getTime())
}

async function updateRunStep(
  runId: string,
  stepKey: string,
  patch: Parameters<typeof updateCommitWorkflowStep>[2]
): Promise<void> {
  const run = getCachedRun(runId)
  if (run) {
    const steps = run.steps.map(s => {
      if (s.stepKey !== stepKey) return s
      return {
        ...s,
        status: patch.status ?? s.status,
        startedAt: patch.startedAt !== undefined ? patch.startedAt : s.startedAt,
        finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : s.finishedAt,
        summary: patch.summary !== undefined ? patch.summary : s.summary,
        externalRef: patch.externalRef !== undefined ? patch.externalRef : s.externalRef,
      }
    })
    setCachedRun({ ...run, steps })
  }
  if (hasDbConfig()) {
    try {
      await updateCommitWorkflowStep(runId, stepKey, patch)
    } catch (e) {
      l.warn(`[commit-workflow] DB step update failed ${runId}/${stepKey}`, e)
    }
  }
}

async function finalizeRunLocal(runId: string, status: import('shared/commitWorkflow/types').CommitWorkflowRunStatus): Promise<void> {
  const run = getCachedRun(runId)
  if (run) {
    setCachedRun({ ...run, status, finishedAt: new Date().toISOString() })
    persistRunToDisk(runId)
  }
  if (hasDbConfig()) {
    try {
      await finalizeCommitWorkflowRun(runId, status)
    } catch (e) {
      l.warn(`[commit-workflow] DB finalize failed ${runId}`, e)
    }
  }
}

async function setRunStatusLocal(runId: string, status: import('shared/commitWorkflow/types').CommitWorkflowRunStatus): Promise<void> {
  const run = getCachedRun(runId)
  if (run) {
    setCachedRun({ ...run, status })
  }
  if (hasDbConfig()) {
    try {
      await updateCommitWorkflowRunStatus(runId, status)
    } catch (e) {
      l.warn(`[commit-workflow] DB status update failed ${runId}`, e)
    }
  }
}

async function markRemainingStepsNotRun(runId: string): Promise<void> {
  const run = getCachedRun(runId)
  if (!run) return
  const now = new Date().toISOString()
  const pending = run.steps.filter(s => s.status === 'pending' || s.status === 'running')
  for (const s of pending) {
    await updateRunStep(runId, s.stepKey, { status: 'not_run', finishedAt: now })
  }
}

function buildLocalRun(
  runId: string,
  input: {
    userId: string
    projectId: string | null
    commitHash: string
    repoPath: string
    workflowId: string | null
    workflowVersion: number
    graphSnapshot: typeof DEFAULT_COMMIT_WORKFLOW_GRAPH
    contextSnapshot: import('shared/commitWorkflow/types').CommitWorkflowContextSnapshot
    steps: Array<{ stepKey: string; stepKind: CommitWorkflowStepKind; sortOrder: number }>
    supersedesRunId?: string | null
  },
  status: 'queued' | 'running' = 'queued'
): NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>> {
  const now = new Date().toISOString()
  return {
    id: runId,
    projectId: input.projectId,
    userId: input.userId,
    commitHash: input.commitHash,
    repoPath: input.repoPath,
    workflowId: input.workflowId,
    workflowVersion: input.workflowVersion,
    graphSnapshot: input.graphSnapshot,
    status,
    startedAt: now,
    finishedAt: null,
    contextSnapshot: input.contextSnapshot,
    supersedesRunId: input.supersedesRunId ?? null,
    steps: input.steps.map((s, i) => ({
      id: `local-step-${runId}-${i}`,
      runId,
      stepKey: s.stepKey,
      stepKind: s.stepKind,
      sortOrder: s.sortOrder,
      status: 'pending' as const,
      startedAt: null,
      finishedAt: null,
      summary: null,
      externalRef: null,
    })),
  }
}

async function persistAndBroadcast(runId: string, activeStepKey: string | null): Promise<void> {
  const run = getCachedRun(runId)
  if (!run) return
  broadcast({
    runId,
    repoPath: run.repoPath,
    commitHash: run.commitHash,
    projectId: run.projectId,
    runStatus: run.status,
    activeStepKey,
    stepStatus: buildStepStatus(run),
    elapsedMs: elapsedMs(run.startedAt),
    runChoices: run.contextSnapshot.runChoices,
  })
}

export function cancelCommitWorkflowForRepo(repoPath: string, reason = 'superseded'): boolean {
  const active = activeByRepo.get(repoPath)
  if (!active) return false
  l.info(`[commit-workflow] cancel run ${active.runId} for ${repoPath} (${reason})`)
  active.abort.abort()
  activeByRepo.delete(repoPath)
  return true
}

export function cancelCommitWorkflowRun(runId: string): boolean {
  for (const [repo, active] of activeByRepo) {
    if (active.runId === runId) {
      active.abort.abort()
      activeByRepo.delete(repo)
      void markRemainingStepsNotRun(runId)
        .then(() => finalizeRunLocal(runId, 'cancelled'))
        .then(() => persistAndBroadcast(runId, null))
      return true
    }
  }
  return false
}

export function getActiveCommitWorkflowRun(repoPath?: string): { runId: string; repoPath: string } | null {
  if (repoPath) {
    const a = activeByRepo.get(repoPath)
    return a ? { runId: a.runId, repoPath } : null
  }
  const first = activeByRepo.values().next().value
  return first ? { runId: first.runId, repoPath: first.repoPath } : null
}

export function getActiveCommitWorkflowRunForProject(projectId: string): { runId: string; repoPath: string } | null {
  const pid = projectId.trim()
  if (!pid) return null
  for (const active of activeByRepo.values()) {
    const run = getCachedRun(active.runId)
    if (run?.projectId === pid) return { runId: active.runId, repoPath: active.repoPath }
  }
  return null
}

export async function resolveActiveCommitWorkflowRunForProject(
  projectId: string
): Promise<{ runId: string; repoPath: string } | null> {
  const mem = getActiveCommitWorkflowRunForProject(projectId)
  if (mem) return mem
  if (!hasDbConfig()) return null
  for (const status of ['running', 'queued'] as const) {
    const rows = await listCommitWorkflowRuns({ projectId, status, limit: 1 })
    if (rows[0]) return { runId: rows[0].id, repoPath: rows[0].repoPath }
  }
  return null
}

async function runWorkflowBody(userId: string, runId: string, signal: AbortSignal): Promise<void> {
  let run = getCachedRun(runId)
  if (!run && hasDbConfig()) {
    const dbRun = await getCommitWorkflowRun(runId)
    if (dbRun) {
      setCachedRun(dbRun)
      run = dbRun
    }
  }
  if (!run) return

  await setRunStatusLocal(runId, 'running')
  await persistAndBroadcast(runId, null)

  const settings = DEFAULT_COMMIT_WORKFLOW_SETTINGS

  let hasCodingRule = false
  let hasSpotbugs = false
  let codingRulesPassed = false
  let spotbugsPassed = false
  let anyFail = false

  const stepIds = allStepNodeIds(run.graphSnapshot)

  for (let i = 0; i < stepIds.length; i++) {
    if (signal.aborted) throw new Error(COMMIT_WORKFLOW_CANCELLED)
    const stepKey = stepIds[i]
    const node = nodeById(run.graphSnapshot, stepKey)
    if (!node || node.data.enabled === false) {
      await updateRunStep(runId, stepKey, {
        status: 'skipped',
        finishedAt: new Date().toISOString(),
      })
      await persistAndBroadcast(runId, null)
      continue
    }

    const kind = node.data.stepKind
    const stepSettings = commitWorkflowNodeToSettings(node, settings)
    const startedAt = new Date().toISOString()
    await updateRunStep(runId, stepKey, { status: 'running', startedAt })
    await persistAndBroadcast(runId, stepKey)

    let stepStatus: CommitWorkflowStepStatus = 'error'
    let summary: Record<string, unknown> | null = null
    let externalRef: string | null = null
    let message: string | undefined

    try {
      if (kind === 'coding-rules') {
        hasCodingRule = true
        const res = await runCodingRulesStep({
          commitHash: run.commitHash,
          repoPath: run.repoPath,
          context: run.contextSnapshot,
          settings: stepSettings,
          userId,
          signal,
        })
        stepStatus = res.status
        summary = res.summary as Record<string, unknown> | null
        message = res.message
        codingRulesPassed = res.status === 'pass' || res.status === 'skipped'
      } else if (kind === 'spotbugs') {
        hasSpotbugs = true
        const res = await runSpotbugsStep({ repoPath: run.repoPath, context: run.contextSnapshot, signal })
        stepStatus = res.status
        summary = res.summary as Record<string, unknown> | null
        message = res.message
        spotbugsPassed = res.status === 'pass' || res.status === 'skipped'
      } else if (kind === 'playwright') {
        const res = await runPlaywrightStep({ settings: stepSettings, taskProjectId: run.projectId, userId, signal })
        stepStatus = res.status
        summary = {
          ...(res.summary ? (res.summary as Record<string, unknown>) : {}),
          ...(res.needsBrowserInstall ? { needsBrowserInstall: true } : {}),
        }
        if (Object.keys(summary).length === 0) summary = null
        message = res.message
        externalRef = res.summary?.testRunId ?? null
      }
    } catch (e) {
      stepStatus = 'error'
      message = e instanceof Error ? e.message : String(e)
    }

    if (stepStatus === 'fail' || stepStatus === 'error') anyFail = true

    await updateRunStep(runId, stepKey, {
      status: stepStatus,
      finishedAt: new Date().toISOString(),
      summary: summary as never,
      externalRef,
    })
    await persistAndBroadcast(runId, null)

    if (message && stepStatus === 'error') {
      l.warn(`[commit-workflow] step ${stepKey} error:`, message)
    }
  }

  const finalStatus = signal.aborted ? 'cancelled' : anyFail ? 'failed' : 'completed'
  await finalizeRunLocal(runId, finalStatus)

  const finalRun = getCachedRun(runId)
  let resolvedFinal = finalRun
  if (hasDbConfig() && finalRun) {
    const dbFinal = await getCommitWorkflowRun(runId)
    if (dbFinal) {
      setCachedRun(dbFinal)
      resolvedFinal = dbFinal
    }
  }
  if (resolvedFinal) {
    persistRunToDisk(runId)
    if (hasDbConfig()) {
      try {
        await linkGitCommitQueueWorkflow(run.commitHash, runId, userId, run.projectId, {
          hasCheckCodingRule: hasCodingRule && codingRulesPassed,
          hasCheckSpotbugs: hasSpotbugs && spotbugsPassed,
        })
        scheduleSyncFlush()
      } catch (e) {
        l.warn('[commit-workflow] DB persist failed, enqueue sync', e)
        enqueueSyncRun(resolvedFinal)
      }
    } else {
      enqueueSyncRun(resolvedFinal)
    }
    runMemory.delete(runId)

    if (finalStatus === 'failed' && run.projectId && anyFail) {
      void notifyWorkflowFailure({
        projectId: run.projectId,
        runId,
        commitHash: run.commitHash,
        settings,
      })
    }
  }

  await persistAndBroadcast(runId, null)
}

export async function startCommitWorkflow(userId: string, payload: CommitWorkflowStartPayload): Promise<string | null> {
  const repoPath = payload.repoPath.trim()
  if (!repoPath || !payload.commitHash) return null

  cancelCommitWorkflowForRepo(repoPath, 'new-commit')

  let projectId = payload.projectId ?? null
  if (!projectId) {
    projectId = await getProjectIdByUserAndPath(userId, repoPath)
  }

  const graph = applyRunChoicesToGraph(payload.runChoices)
  const workflowId = null
  const workflowVersion = 1

  const stepIds = allStepNodeIds(graph)
  const steps = stepIds.map((stepKey, sortOrder) => {
    const node = nodeById(graph, stepKey)!
    return { stepKey, stepKind: node.data.stepKind as CommitWorkflowStepKind, sortOrder }
  })

  const contextSnapshot = {
    commitMessage: payload.commitInfo.commitMessage,
    branch: payload.commitInfo.branch,
    addedFiles: payload.commitInfo.addedFiles ?? [],
    modifiedFiles: payload.commitInfo.modifiedFiles ?? [],
    deletedFiles: payload.commitInfo.deletedFiles ?? [],
    runChoices: payload.runChoices,
    ...(payload.commitInfo.svnDiffContent ? { svnDiffContent: payload.commitInfo.svnDiffContent } : {}),
  }

  let supersedesRunId: string | null = null
  const replaceHash = payload.replacesCommitHash?.trim()
  if (replaceHash) {
    try {
      let oldId: string | null = null
      if (hasDbConfig()) {
        oldId = await findCommitWorkflowRunByCommit(repoPath, replaceHash, userId)
      } else {
        const local = getLocalCommitWorkflowRuns(repoPath, 20).find(r => r.commitHash === replaceHash && r.userId === userId)
        oldId = local?.id ?? null
      }
      if (oldId) {
        supersedesRunId = oldId
        if (hasDbConfig()) await markCommitWorkflowRunSuperseded(oldId)
        const oldCached = getCachedRun(oldId)
        if (oldCached) {
          setCachedRun({ ...oldCached, status: 'superseded', finishedAt: oldCached.finishedAt ?? new Date().toISOString() })
          persistRunToDisk(oldId)
        }
      }
    } catch (e) {
      l.warn('[commit-workflow] supersede lookup failed', e)
    }
  }

  let runId: string
  const runRecord = {
    userId,
    projectId,
    commitHash: payload.commitHash,
    repoPath,
    workflowId,
    workflowVersion,
    graphSnapshot: graph,
    contextSnapshot,
    steps,
    supersedesRunId,
  }

  if (hasDbConfig()) {
    try {
      const run = await insertCommitWorkflowRun(runRecord)
      runId = run.id
      setCachedRun(run)
      persistRunToDisk(runId)
    } catch (e) {
      l.warn('[commit-workflow] insert run failed, fallback to local', e)
      const { randomUuidV7 } = await import('shared/randomUuidV7')
      runId = randomUuidV7()
      const localRun = buildLocalRun(runId, { ...runRecord, graphSnapshot: graph, contextSnapshot }, 'queued')
      setCachedRun(localRun)
      persistRunToDisk(runId)
    }
  } else {
    const { randomUuidV7 } = await import('shared/randomUuidV7')
    runId = randomUuidV7()
    const localRun = buildLocalRun(runId, { ...runRecord, graphSnapshot: graph, contextSnapshot }, 'queued')
    setCachedRun(localRun)
    persistRunToDisk(runId)
  }

  const abort = new AbortController()
  activeByRepo.set(repoPath, { runId, repoPath, abort })

  void runWorkflowBody(userId, runId, abort.signal)
    .catch(err => {
      if (err instanceof Error && err.message === COMMIT_WORKFLOW_CANCELLED) {
        void markRemainingStepsNotRun(runId)
          .then(() => finalizeRunLocal(runId, 'cancelled'))
          .then(() => persistAndBroadcast(runId, null))
      } else {
        l.error('[commit-workflow] body failed', err)
        void finalizeRunLocal(runId, 'failed').then(() => persistAndBroadcast(runId, null))
      }
    })
    .finally(() => {
      const active = activeByRepo.get(repoPath)
      if (active?.runId === runId) activeByRepo.delete(repoPath)
    })

  await persistAndBroadcast(runId, null)
  return runId
}

export function pruneLocalCommitWorkflowRuns(olderThanDays: number): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const runs = localRuns.get('runs') ?? {}
  let pruned = 0
  const next: typeof runs = {}
  for (const [id, run] of Object.entries(runs)) {
    if (!run) continue
    const started = run.startedAt ? new Date(run.startedAt).getTime() : 0
    if (started > 0 && started < cutoff) {
      pruned++
      runMemory.delete(id)
      continue
    }
    next[id] = run
  }
  if (pruned > 0) localRuns.set('runs', next)
  return pruned
}

export function getLocalCommitWorkflowRuns(repoPath?: string, limit = 10) {
  const merged = new Map<string, NonNullable<Awaited<ReturnType<typeof getCommitWorkflowRun>>>>()
  for (const [id, run] of Object.entries(localRuns.get('runs') ?? {})) {
    if (run) merged.set(id, run)
  }
  for (const [id, run] of runMemory) {
    merged.set(id, run)
  }
  const runs = [...merged.values()]
  const filtered = repoPath ? runs.filter(r => r.repoPath === repoPath) : runs
  return filtered.sort(compareCommitWorkflowRunsByStartedAtDesc).slice(0, limit)
}

export async function loadCommitWorkflowRun(runId: string) {
  const cached = getCachedRun(runId)
  if (cached) return cached
  if (hasDbConfig()) {
    const run = await getCommitWorkflowRun(runId)
    if (run) {
      setCachedRun(run)
      return run
    }
  }
  return null
}
