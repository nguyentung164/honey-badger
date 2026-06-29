'use client'

import { memo, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Switch } from '@/components/ui/switch'
import type { CommitWorkflowGraphJson, CommitWorkflowPersistedNode } from 'shared/commitWorkflow/types'
import { cn } from '@/lib/utils'
import '@xyflow/react/dist/style.css'

type EditorNodeData = {
  label: string
  stepKind: string
  enabled: boolean
  selected?: boolean
}

const EditorStepNode = memo(function EditorStepNode({ data }: NodeProps<Node<EditorNodeData>>) {
  return (
    <div
      className={cn(
        'min-w-[150px] rounded-lg border bg-card px-3 py-2 text-xs shadow-sm',
        data.enabled ? 'border-primary/40' : 'border-border opacity-50',
        data.selected && 'ring-2 ring-primary'
      )}
    >
      <div className="font-medium">{data.label}</div>
      <div className="mt-0.5 text-[10px] uppercase text-muted-foreground">{data.stepKind}</div>
    </div>
  )
})

const nodeTypes = { commitWorkflowEditorStep: EditorStepNode }

function graphToFlow(graph: CommitWorkflowGraphJson, selectedId: string | null) {
  const nodes: Node<EditorNodeData>[] = graph.nodes.map(n => ({
    id: n.id,
    type: 'commitWorkflowEditorStep',
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.data.label,
      stepKind: n.data.stepKind,
      enabled: n.data.enabled !== false,
      selected: selectedId === n.id,
    },
    draggable: true,
    selectable: true,
  }))
  const edges: Edge[] = (graph.edges ?? []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
  }))
  return { nodes, edges }
}

function flowToGraph(nodes: Node<EditorNodeData>[], graph: CommitWorkflowGraphJson): CommitWorkflowGraphJson {
  const posById = new Map(nodes.map(n => [n.id, n.position]))
  const dataById = new Map(nodes.map(n => [n.id, n.data]))
  return {
    ...graph,
    nodes: graph.nodes.map(n => {
      const pos = posById.get(n.id)
      const data = dataById.get(n.id)
      return {
        ...n,
        position: pos ?? n.position,
        data: {
          ...n.data,
          enabled: data?.enabled ?? n.data.enabled !== false,
        },
      } satisfies CommitWorkflowPersistedNode
    }),
  }
}

const CommitWorkflowGraphEditorInner = memo(function CommitWorkflowGraphEditorInner({
  graph,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
}: {
  graph: CommitWorkflowGraphJson
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onGraphChange: (graph: CommitWorkflowGraphJson) => void
}) {
  const initial = useMemo(() => graphToFlow(graph, selectedNodeId), [graph, selectedNodeId])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  useEffect(() => {
    const next = graphToFlow(graph, selectedNodeId)
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [graph, selectedNodeId, setNodes, setEdges])

  return (
    <div className="h-[min(360px,45vh)] w-full rounded-lg border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeDragStop={() => {
          setNodes(nds => {
            onGraphChange(flowToGraph(nds as Node<EditorNodeData>[], graph))
            return nds
          })
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        fitView
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
})

export const CommitWorkflowGraphEditor = memo(function CommitWorkflowGraphEditor({
  graph,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
}: {
  graph: CommitWorkflowGraphJson
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onGraphChange: (graph: CommitWorkflowGraphJson) => void
}) {
  const { t } = useTranslation()
  const selected = graph.nodes.find(n => n.id === selectedNodeId)

  const toggleEnabled = (enabled: boolean) => {
    if (!selectedNodeId) return
    onGraphChange({
      ...graph,
      nodes: graph.nodes.map(n => (n.id === selectedNodeId ? { ...n, data: { ...n.data, enabled } } : n)),
    })
  }

  return (
    <div className="space-y-3">
      <ReactFlowProvider>
        <CommitWorkflowGraphEditorInner
          graph={graph}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onGraphChange={onGraphChange}
        />
      </ReactFlowProvider>
      {selected ? (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>{selected.data.label}</span>
          <div className="flex items-center gap-2 text-xs">
            <Switch id={`cw-step-enabled-${selectedNodeId}`} checked={selected.data.enabled !== false} onCheckedChange={toggleEnabled} />
            <label htmlFor={`cw-step-enabled-${selectedNodeId}`}>{t('commitWorkflow.editorEnableStep')}</label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('commitWorkflow.editorSelectStepHint')}</p>
      )}
    </div>
  )
})
