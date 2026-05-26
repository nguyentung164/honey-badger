/**
 * Dev Pipelines — build/release orchestration graphs (tách khỏi Automation Test / Playwright).
 */

import type { FlowConnectionStyle, FlowNodeVisualStyle } from '../flowDiagramStyle'
import type { PageMapAnnotationStyle } from '../pageMapAnnotationStyle'

export type DevPipelineStepKind = 'noop' | 'delay' | 'shell' | 'approval' | 'http-check'

export type DevPipelineNodeParams = {
  /** Delay step duration (ms). */
  ms?: number
  /** HTTP health-check URL. */
  url?: string
  /** Expected HTTP status code (default 200). */
  expectedStatus?: number
  /** Total timeout budget for polling (ms). */
  timeoutMs?: number
  /** Delay between HTTP poll attempts (ms). */
  retryDelayMs?: number
  /** Max poll attempts before failing. */
  maxRetries?: number
}

export type DevPipelineNodeData = {
  label: string
  stepKind: DevPipelineStepKind
  params?: DevPipelineNodeParams
  /** Đường dẫn tuyệt đối tới .bat / .cmd / .sh … (Windows: nên dùng đường dẫn đầy đủ) */
  scriptPath?: string
  /** Lệnh inline (shell), dùng khi không dùng scriptPath */
  command?: string
  /** cwd riêng cho node; để trống thì dùng graph.defaultCwd */
  cwd?: string
  /**
   * true (mặc định): chờ process thoát rồi mới sang node kế.
   * false: chạy script (vd. start service), không chặn DAG; process vẫn chạy để xem log; khi Cancel / lỗi run sẽ kill.
   */
  waitForExit?: boolean
  /** Message shown in the approval banner while awaiting user action. */
  approvalMessage?: string
  /** Màu / icon hiển thị trên canvas (flow inspector). */
  diagramVisual?: FlowNodeVisualStyle
}

export type DevPipelineGroupNodeData = {
  label: string
  hint?: string
  diagramVisual?: FlowNodeVisualStyle
}

export type DevPipelineNoteNodeData = {
  content: string
  style?: PageMapAnnotationStyle
  diagramVisual?: FlowNodeVisualStyle
  /** CSS min-height floor — not a fixed RF node height. */
  minHeight?: number
}

export type DevPipelineNodePersistedData = DevPipelineNodeData | DevPipelineGroupNodeData | DevPipelineNoteNodeData

/** When an edge fires relative to its source step outcome. */
export type DevPipelineEdgeCondition = 'always' | 'on-success' | 'on-failure'

/** Subset of @xyflow/react node persisted in DB */
export type DevPipelinePersistedNode = {
  id: string
  type: string
  position: { x: number; y: number }
  parentId?: string
  width?: number
  height?: number
  data: DevPipelineNodePersistedData
}

export type DevPipelineRunScope =
  | { mode: 'full' }
  | { mode: 'node'; nodeId: string }
  | { mode: 'group'; groupId: string }

export type DevPipelinePersistedEdge = {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: {
    connectionStyle?: Partial<FlowConnectionStyle>
    label?: string
    condition?: DevPipelineEdgeCondition
  }
}

export type DevPipelineGraphJson = {
  version: number
  /** cwd mặc định khi node không gõ cwd */
  defaultCwd?: string
  nodes: DevPipelinePersistedNode[]
  edges: DevPipelinePersistedEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

export type DevPipelineFlowSummary = {
  id: string
  name: string
  description?: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export type DevPipelineFlow = DevPipelineFlowSummary & {
  graph: DevPipelineGraphJson
}

export type DevPipelineRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DevPipelineStepRunStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'awaiting-approval'

export type DevPipelineStepStatusEntry = {
  status: DevPipelineStepRunStatus
  message?: string
  startedAt?: string
  finishedAt?: string
}

export type DevPipelineRunSummary = {
  id: string
  flowId: string
  status: DevPipelineRunStatus
  stepStatus: Record<string, DevPipelineStepStatusEntry>
  startedAt: string | null
  finishedAt: string | null
}

export type DevPipelineRunStreamPayload = {
  runId: string
  flowId: string
  /** Whole map or partial patch for UI merge */
  stepStatus: Record<string, DevPipelineStepStatusEntry>
  activeNodeId?: string | null
  activeEdgeId?: string | null
  runStatus?: DevPipelineRunStatus
}

export type DevPipelineLogStreamPayload = {
  runId: string
  nodeId: string
  stream: 'stdout' | 'stderr'
  line: string
}
