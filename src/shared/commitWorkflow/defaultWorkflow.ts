import type { CommitWorkflowGraphJson, CommitWorkflowSettings } from './types'

export const DEFAULT_COMMIT_WORKFLOW_GRAPH: CommitWorkflowGraphJson = {
  version: 1,
  nodes: [
    {
      id: 'step-coding-rules',
      type: 'commitWorkflowStep',
      position: { x: 0, y: 0 },
      data: { label: 'Coding Rules', stepKind: 'coding-rules', enabled: true },
    },
    {
      id: 'step-spotbugs',
      type: 'commitWorkflowStep',
      position: { x: 0, y: 120 },
      data: { label: 'SpotBugs', stepKind: 'spotbugs', enabled: true },
    },
    {
      id: 'step-playwright',
      type: 'commitWorkflowStep',
      position: { x: 0, y: 240 },
      data: { label: 'Playwright', stepKind: 'playwright', enabled: true },
    },
  ],
  edges: [
    { id: 'e1', source: 'step-coding-rules', target: 'step-spotbugs' },
    { id: 'e2', source: 'step-spotbugs', target: 'step-playwright' },
  ],
}

export const DEFAULT_COMMIT_WORKFLOW_SETTINGS: CommitWorkflowSettings = {
  automationProjectId: null,
  suiteId: null,
  pageIds: [],
  notifyOnFail: ['pl'],
  codingRuleId: null,
  codingRuleName: null,
}

/** Topological order of all step node ids (includes disabled — for run records). */
export function allStepNodeIds(graph: CommitWorkflowGraphJson): string[] {
  const allEnabled = {
    ...graph,
    nodes: graph.nodes.map(n => ({ ...n, data: { ...n.data, enabled: true } })),
  }
  return orderedStepNodeIds(allEnabled)
}

/** Topological order of enabled step node ids. */
export function orderedStepNodeIds(graph: CommitWorkflowGraphJson): string[] {
  const enabled = new Set(graph.nodes.filter(n => n.data.enabled !== false).map(n => n.id))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of enabled) {
    inDegree.set(id, 0)
    adj.set(id, [])
  }
  for (const e of graph.edges) {
    if (!enabled.has(e.source) || !enabled.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }
  const queue = [...enabled].filter(id => (inDegree.get(id) ?? 0) === 0)
  const out: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    out.push(id)
    for (const next of adj.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  for (const id of enabled) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function nodeById(graph: CommitWorkflowGraphJson, id: string) {
  return graph.nodes.find(n => n.id === id)
}
