import { spawn, type ChildProcess } from 'node:child_process'
import { BrowserWindow } from 'electron'
import l from 'electron-log'
import { IPC } from 'main/constants'
import type {
  DevPipelineEdgeCondition,
  DevPipelineGraphJson,
  DevPipelineLogStreamPayload,
  DevPipelineNodeData,
  DevPipelinePersistedNode,
  DevPipelineRunScope,
  DevPipelineRunStreamPayload,
  DevPipelineStepStatusEntry,
} from 'shared/devPipelines/types'
import { buildScopedRunPlan, isDevPipelineStepNode } from 'shared/devPipelines/runScope'
import { runSequentialReadyNodes } from 'shared/devPipelines/sequentialScheduler'
import type { FlowExecEdge } from 'shared/flowExecution'
import { getDevPipelineFlow, insertDevPipelineRun, updateDevPipelineRunStepJson, finalizeDevPipelineRun } from './db'
import { parseAndValidateGraph } from './graph'

const DEV_PIPELINE_CANCELLED_MESSAGE = '__DEV_PIPELINE_CANCELLED__'
const DEV_PIPELINE_DELAY_MAX_MS = 120_000
const DEV_PIPELINE_DELAY_MIN_MS = 50

type NodeOutcome = 'success' | 'error' | 'skipped'

type IncomingEdge = {
  source: string
  edgeId: string
  condition: DevPipelineEdgeCondition
}

const pendingApprovals = new Map<string, (approved: boolean) => void>()

function broadcastRun(payload: DevPipelineRunStreamPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(IPC.DEV_PIPELINE.STREAM_RUN, payload)
    } catch {
      /* ignore */
    }
  }
}

function broadcastLog(payload: DevPipelineLogStreamPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(IPC.DEV_PIPELINE.STREAM_LOG, payload)
    } catch {
      /* ignore */
    }
  }
}

interface ActiveDevRun {
  cancelled: boolean
  processes: ChildProcess[]
}

const activeDevRuns = new Map<string, ActiveDevRun>()

function registerProcess(runId: string, cp: ChildProcess): void {
  const a = activeDevRuns.get(runId)
  if (a) a.processes.push(cp)
}

function killRunProcesses(runId: string): void {
  const a = activeDevRuns.get(runId)
  if (!a) return
  for (const p of a.processes) {
    try {
      p.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  a.processes.length = 0
}

function rejectPendingApprovals(runId: string): void {
  const prefix = `${runId}:`
  for (const [key, resolve] of pendingApprovals) {
    if (key.startsWith(prefix)) {
      pendingApprovals.delete(key)
      resolve(false)
    }
  }
}

export function cancelDevPipelineRun(runId: string): boolean {
  const a = activeDevRuns.get(runId)
  if (!a) return false
  a.cancelled = true
  rejectPendingApprovals(runId)
  killRunProcesses(runId)
  return true
}

export function respondApproval(runId: string, nodeId: string, approved: boolean): boolean {
  const key = `${runId}:${nodeId}`
  const resolve = pendingApprovals.get(key)
  if (!resolve) return false
  pendingApprovals.delete(key)
  resolve(approved)
  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function findIncomingEdge(edges: DevPipelineGraphJson['edges'], nodeId: string): string | undefined {
  const e = edges.find(edge => edge.target === nodeId)
  return e?.id
}

function resolveCwd(node: DevPipelineNodeData, graph: DevPipelineGraphJson): string {
  const n = node.cwd?.trim()
  if (n) return n
  const d = graph.defaultCwd?.trim()
  if (d) return d
  return process.cwd()
}

function attachLogStreams(runId: string, nodeId: string, cp: ChildProcess): void {
  const pipe = (stream: NodeJS.ReadableStream | null, kind: 'stdout' | 'stderr') => {
    if (!stream) return
    let carry = ''
    stream.on('data', (buf: Buffer) => {
      carry += buf.toString('utf8')
      const parts = carry.split(/\r?\n/)
      carry = parts.pop() ?? ''
      for (const line of parts) {
        broadcastLog({ runId, nodeId, stream: kind, line })
      }
    })
    stream.on('end', () => {
      if (carry.length) broadcastLog({ runId, nodeId, stream: kind, line: carry })
      carry = ''
    })
  }
  pipe(cp.stdout, 'stdout')
  pipe(cp.stderr, 'stderr')
}

function buildGraphIndex(graph: DevPipelineGraphJson, edges: DevPipelineGraphJson['edges']) {
  const incoming = new Map<string, IncomingEdge[]>()
  const nodeIds = graph.nodes.map(n => n.id)
  for (const id of nodeIds) incoming.set(id, [])
  for (const e of edges) {
    incoming.get(e.target)?.push({
      source: e.source,
      edgeId: e.id,
      condition: e.data?.condition ?? 'always',
    })
  }
  return {
    incoming,
    nodeIds,
    nodeById: new Map(graph.nodes.map(n => [n.id, n])),
  }
}

function edgeConditionMet(outcome: NodeOutcome, condition: DevPipelineEdgeCondition): boolean {
  if (outcome === 'skipped') return condition === 'always'
  if (condition === 'always') return true
  if (condition === 'on-success') return outcome === 'success'
  if (condition === 'on-failure') return outcome === 'error'
  return true
}

function canRunNode(
  nodeId: string,
  incoming: Map<string, IncomingEdge[]>,
  resolved: Map<string, NodeOutcome>,
  scopeNodeIds: Set<string>,
  treatExternalAsSuccess: boolean,
): boolean {
  const edges = incoming.get(nodeId) ?? []
  if (edges.length === 0) return true

  const inScopeEdges = treatExternalAsSuccess ? edges.filter(e => scopeNodeIds.has(e.source)) : edges
  if (inScopeEdges.length === 0) return true

  const sources = [...new Set(inScopeEdges.map(e => e.source))]
  if (!sources.every(s => resolved.has(s))) return false

  return sources.every(source => {
    const fromSource = inScopeEdges.filter(e => e.source === source)
    const outcome = resolved.get(source)!
    return fromSource.some(e => edgeConditionMet(outcome, e.condition))
  })
}

async function runShellStep(
  runId: string,
  graph: DevPipelineGraphJson,
  nodeId: string,
  data: DevPipelineNodeData,
  isCancelled: () => boolean
): Promise<void> {
  const script = data.scriptPath?.trim() ?? ''
  const cmd = data.command?.trim() ?? ''
  if (!script && !cmd) {
    throw new Error('Shell step requires scriptPath or command')
  }
  const cwd = resolveCwd(data, graph)
  const toRun = script || cmd
  const cp = spawn(toRun, [], {
    cwd,
    shell: true,
    windowsHide: true,
    env: { ...process.env },
  })
  registerProcess(runId, cp)
  attachLogStreams(runId, nodeId, cp)

  const waitForExit = data.waitForExit !== false
  if (!waitForExit) {
    cp.on('error', err => {
      l.warn('[dev-pipeline] shell background error', nodeId, err)
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    cp.once('error', err => reject(err))
    cp.once('exit', (code, signal) => {
      if (isCancelled()) {
        reject(new Error(DEV_PIPELINE_CANCELLED_MESSAGE))
        return
      }
      if (code === 0) resolve()
      else reject(new Error(`Process exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`))
    })
  })
}

async function runDelayStep(runId: string, ms: number, isCancelled: () => boolean): Promise<void> {
  const clamped = Math.min(DEV_PIPELINE_DELAY_MAX_MS, Math.max(DEV_PIPELINE_DELAY_MIN_MS, ms))
  const chunk = 200
  let left = clamped
  while (left > 0) {
    const step = Math.min(chunk, left)
    await sleep(step)
    left -= step
    if (isCancelled() || activeDevRuns.get(runId)?.cancelled) return
  }
}

async function runApprovalStep(runId: string, nodeId: string, isCancelled: () => boolean): Promise<void> {
  const approved = await new Promise<boolean>((resolve, reject) => {
    const key = `${runId}:${nodeId}`
    pendingApprovals.set(key, resolve)
    if (isCancelled()) {
      pendingApprovals.delete(key)
      reject(new Error(DEV_PIPELINE_CANCELLED_MESSAGE))
    }
  })
  if (!approved) throw new Error('Approval rejected by user')
}

async function runHttpCheckStep(
  runId: string,
  nodeId: string,
  data: DevPipelineNodeData,
  isCancelled: () => boolean
): Promise<void> {
  const params = data.params ?? {}
  const url = params.url?.trim() ?? ''
  if (!url) throw new Error('HTTP check requires params.url')
  const expectedStatus = params.expectedStatus ?? 200
  const timeoutMs = params.timeoutMs ?? 30_000
  const retryDelayMs = params.retryDelayMs ?? 2_000
  const maxRetries = Math.max(1, params.maxRetries ?? 10)
  const perAttemptTimeout = Math.max(1000, Math.floor(timeoutMs / maxRetries))

  let lastStatus: number | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (isCancelled() || activeDevRuns.get(runId)?.cancelled) {
      throw new Error(DEV_PIPELINE_CANCELLED_MESSAGE)
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(perAttemptTimeout) })
      lastStatus = res.status
      if (res.status === expectedStatus) {
        broadcastLog({ runId, nodeId, stream: 'stdout', line: `HTTP ${res.status} OK — ${url}` })
        return
      }
      broadcastLog({
        runId,
        nodeId,
        stream: 'stderr',
        line: `Attempt ${attempt + 1}/${maxRetries}: expected ${expectedStatus}, got ${res.status}`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      broadcastLog({ runId, nodeId, stream: 'stderr', line: `Attempt ${attempt + 1}/${maxRetries}: ${msg}` })
    }
    if (attempt < maxRetries - 1) await runDelayStep(runId, retryDelayMs, isCancelled)
  }
  throw new Error(`HTTP check failed: expected ${expectedStatus}, last status ${lastStatus ?? 'unknown'}`)
}

async function executeNodeStep(
  runId: string,
  graph: DevPipelineGraphJson,
  node: DevPipelinePersistedNode,
  isCancelled: () => boolean
): Promise<void> {
  const data = node.data as DevPipelineNodeData
  const kind = data.stepKind
  if (kind === 'delay') {
    await runDelayStep(runId, data.params?.ms ?? 600, isCancelled)
  } else if (kind === 'shell') {
    await runShellStep(runId, graph, node.id, data, isCancelled)
  } else if (kind === 'approval') {
    await runApprovalStep(runId, node.id, isCancelled)
  } else if (kind === 'http-check') {
    await runHttpCheckStep(runId, node.id, data, isCancelled)
  } else if (kind === 'noop') {
    /* no-op */
  }
}

async function runPipelineBody(
  userId: string,
  flowId: string,
  runId: string,
  graph: DevPipelineGraphJson,
  flowName: string,
  scope?: DevPipelineRunScope,
): Promise<void> {
  const plan = buildScopedRunPlan(graph, scope)
  const scopedGraph: DevPipelineGraphJson = { ...graph, edges: plan.edges }
  const executableSet = new Set(plan.executableNodeIds)
  const stepStatus: Record<string, DevPipelineStepStatusEntry> = {}
  const { nodeById } = buildGraphIndex(scopedGraph, plan.edges)
  const nodeIds = plan.executableNodeIds
  const resolved = new Map<string, NodeOutcome>()
  const running = new Set<string>()
  let completedClean = false
  let cancelled = false
  const now = new Date().toISOString()

  for (const node of graph.nodes) {
    if (!executableSet.has(node.id) && isDevPipelineStepNode(node)) {
      stepStatus[node.id] = { status: 'skipped', finishedAt: now }
      resolved.set(node.id, 'skipped')
    }
  }
  for (const disabledId of plan.disabledNodeIds) {
    if (!stepStatus[disabledId]) {
      stepStatus[disabledId] = { status: 'skipped', finishedAt: now }
      resolved.set(disabledId, 'skipped')
    }
  }

  const flowExecEdges: FlowExecEdge[] = plan.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    runOrder: e.data?.runOrder,
    condition: e.data?.condition,
  }))
  const nodeByIdForPick = new Map(
    graph.nodes.filter(isDevPipelineStepNode).map(n => [
      n.id,
      { id: n.id, label: (n.data as DevPipelineNodeData).label },
    ]),
  )
  const push = (extra: Partial<DevPipelineRunStreamPayload> = {}) => {
    broadcastRun({
      runId,
      flowId,
      stepStatus: { ...stepStatus },
      runStatus: 'running',
      ...extra,
    })
  }

  const isCancelled = () => activeDevRuns.get(runId)?.cancelled === true

  const markCancelledAndExit = async (): Promise<void> => {
    cancelled = true
    const now = new Date().toISOString()
    for (const nid of nodeIds) {
      if (!stepStatus[nid]) stepStatus[nid] = { status: 'skipped', finishedAt: now }
      else if (
        stepStatus[nid].status === 'pending' ||
        stepStatus[nid].status === 'running' ||
        stepStatus[nid].status === 'awaiting-approval'
      ) {
        stepStatus[nid] = { ...stepStatus[nid], status: 'skipped', finishedAt: now }
      }
    }
    await updateDevPipelineRunStepJson(userId, runId, stepStatus, 'cancelled')
    await finalizeDevPipelineRun(userId, runId, 'cancelled')
    push({ runStatus: 'cancelled', activeNodeId: null, activeEdgeId: null })
  }

  const runOneNode = async (nodeId: string): Promise<void> => {
    const node = nodeById.get(nodeId)
    if (!node || !isDevPipelineStepNode(node)) return
    const stepData = node.data as DevPipelineNodeData

    const startedAt = new Date().toISOString()
    const isApproval = stepData.stepKind === 'approval'
    stepStatus[nodeId] = { status: isApproval ? 'awaiting-approval' : 'running', startedAt }
    const edgeId = findIncomingEdge(plan.edges, nodeId)
    await updateDevPipelineRunStepJson(userId, runId, stepStatus, 'running')
    push({ activeNodeId: nodeId, activeEdgeId: edgeId })

    try {
      if (isCancelled()) throw new Error(DEV_PIPELINE_CANCELLED_MESSAGE)
      await executeNodeStep(runId, graph, node, isCancelled)
      if (isCancelled()) throw new Error(DEV_PIPELINE_CANCELLED_MESSAGE)
      const finishedAt = new Date().toISOString()
      stepStatus[nodeId] = { status: 'success', startedAt, finishedAt }
      resolved.set(nodeId, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === DEV_PIPELINE_CANCELLED_MESSAGE || isCancelled()) {
        resolved.set(nodeId, 'skipped')
        throw err
      }
      const finishedAt = new Date().toISOString()
      stepStatus[nodeId] = { status: 'error', message: msg, startedAt, finishedAt }
      resolved.set(nodeId, 'error')
    }

    await updateDevPipelineRunStepJson(userId, runId, stepStatus, 'running')
    push({ activeNodeId: nodeId })
  }

  try {
    await runSequentialReadyNodes({
      nodeIds,
      edges: flowExecEdges,
      scopeNodeIds: plan.scopeNodeIds,
      treatExternalAsSuccess: plan.treatExternalAsSuccess,
      nodeById: nodeByIdForPick,
      resolved,
      shouldStop: () => cancelled || isCancelled(),
      runOne: async nodeId => {
        if (cancelled || isCancelled()) {
          cancelled = true
          throw new Error(DEV_PIPELINE_CANCELLED_MESSAGE)
        }
        running.add(nodeId)
        try {
          await runOneNode(nodeId)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg === DEV_PIPELINE_CANCELLED_MESSAGE || isCancelled()) cancelled = true
          throw err
        } finally {
          running.delete(nodeId)
        }
      },
    })

    if (cancelled || isCancelled()) {
      await markCancelledAndExit()
      return
    }

    const now = new Date().toISOString()
    for (const nid of nodeIds) {
      if (!resolved.has(nid)) {
        stepStatus[nid] = { status: 'skipped', finishedAt: now }
        resolved.set(nid, 'skipped')
      }
    }

    const hasError = [...resolved.values()].some(o => o === 'error')
    const finalStatus = hasError ? 'failed' : 'completed'
    await updateDevPipelineRunStepJson(userId, runId, stepStatus, finalStatus)
    await finalizeDevPipelineRun(userId, runId, finalStatus)
    push({ runStatus: finalStatus, activeNodeId: null, activeEdgeId: null })
    completedClean = true

    if (hasError) killRunProcesses(runId)
  } catch (e) {
    l.error('[dev-pipeline] run body failed', flowName, e)
    await finalizeDevPipelineRun(userId, runId, 'failed').catch(() => {})
    broadcastRun({
      runId,
      flowId,
      stepStatus: {},
      runStatus: 'failed',
      activeNodeId: null,
      activeEdgeId: null,
    })
    killRunProcesses(runId)
  } finally {
    rejectPendingApprovals(runId)
    if (!completedClean) {
      killRunProcesses(runId)
    }
    activeDevRuns.delete(runId)
  }
}

/** Tạo bản ghi run, đăng ký cancel, chạy pipeline nền; trả về runId. */
export async function startDevPipelineRun(
  userId: string,
  flowId: string,
  scope?: DevPipelineRunScope,
): Promise<string | null> {
  const flow = await getDevPipelineFlow(userId, flowId)
  if (!flow) {
    l.warn('[dev-pipeline] run: flow not found', flowId)
    return null
  }
  let graph: DevPipelineGraphJson
  try {
    graph = parseAndValidateGraph(flow.graph)
  } catch (e) {
    l.warn('[dev-pipeline] run: invalid graph', e)
    return null
  }

  const plan = buildScopedRunPlan(graph, scope)
  if (plan.executableNodeIds.length === 0) {
    l.warn('[dev-pipeline] run: empty scope')
    return null
  }

  const runSummary = await insertDevPipelineRun(userId, flowId, { flowName: flow.name })
  const runId = runSummary.id
  activeDevRuns.set(runId, { cancelled: false, processes: [] })
  void runPipelineBody(userId, flowId, runId, graph, flow.name, scope).catch(err => {
    l.error('[dev-pipeline] runPipelineBody', err)
  })
  return runId
}
