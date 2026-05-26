import type { DevPipelineNodeData } from './types'
import type { PipelineNodeTemplate, PipelineSnippetNode } from './templateCatalog'
import { mergeNodeVisualStyle } from '../flowDiagramStyle'
import { readBoardContentDefaults } from '../flowNodeBoardDefaults'

type TemplateNodeSource = Pick<
  PipelineNodeTemplate,
  'stepKind' | 'accentColor' | 'iconKey' | 'command' | 'scriptPath' | 'cwd' | 'waitForExit' | 'params' | 'approvalMessage'
>

/** Map a catalog node/snippet entry to persisted pipeline node data (without runVisual). */
export function buildNodeDataFromTemplate(tpl: TemplateNodeSource, label: string): DevPipelineNodeData {
  const boardLayout = readBoardContentDefaults('devPipelines')
  const data: DevPipelineNodeData = {
    label,
    stepKind: tpl.stepKind,
    diagramVisual: mergeNodeVisualStyle({
      accentColor: tpl.accentColor,
      iconKey: tpl.iconKey,
      ...boardLayout,
    }),
  }

  if (tpl.stepKind === 'shell') {
    data.command = tpl.command ?? ''
    if (tpl.scriptPath) data.scriptPath = tpl.scriptPath
    if (tpl.cwd) data.cwd = tpl.cwd
    data.waitForExit = tpl.waitForExit !== false
  } else if (tpl.stepKind === 'delay') {
    data.params = tpl.params ?? { ms: 600 }
  } else if (tpl.stepKind === 'http-check') {
    data.params = tpl.params ?? {
      url: 'http://localhost:3000/health',
      expectedStatus: 200,
      timeoutMs: 30000,
      retryDelayMs: 2000,
      maxRetries: 10,
    }
  } else if (tpl.stepKind === 'approval') {
    if (tpl.approvalMessage) data.approvalMessage = tpl.approvalMessage
  }

  return data
}

export function buildNodeDataFromSnippetNode(n: PipelineSnippetNode, label: string): DevPipelineNodeData {
  return buildNodeDataFromTemplate(n, label)
}
