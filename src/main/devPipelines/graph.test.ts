import { describe, expect, it } from 'vitest'
import { parseAndValidateGraph, validateGraphForRun } from './graph'

describe('parseAndValidateGraph', () => {
  it('preserves node diagramVisual and edge connectionStyle', () => {
    const raw = {
      version: 1,
      nodes: [
        {
          id: 'a',
          type: 'pipelineStep',
          position: { x: 0, y: 0 },
          data: {
            label: 'Build',
            stepKind: 'shell',
            command: 'npm run build',
            diagramVisual: { accentColor: '#ff00aa', nodeAnimation: 'glow' },
          },
        },
        {
          id: 'b',
          type: 'pipelineStep',
          position: { x: 200, y: 0 },
          data: { label: 'Done', stepKind: 'noop' },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          type: 'labeled',
          sourceHandle: 's-bottom',
          targetHandle: 't-top',
          data: {
            label: 'next',
            connectionStyle: { color: '#336699', curve: 'step', animation: 'flow' },
          },
        },
      ],
    }

    const graph = parseAndValidateGraph(raw)
    expect(graph.nodes[0].data.diagramVisual?.accentColor).toBe('#ff00aa')
    expect(graph.nodes[0].data.diagramVisual?.nodeAnimation).toBe('glow')
    expect(graph.nodes[1].data.diagramVisual).toBeUndefined()
    expect(graph.edges[0].data?.connectionStyle?.color).toBe('#336699')
    expect(graph.edges[0].data?.connectionStyle?.curve).toBe('step')
    expect(graph.edges[0].data?.connectionStyle?.animation).toBe('flow')
    expect(graph.edges[0].data?.label).toBe('next')
  })

  it('accepts approval and http-check nodes', () => {
    const raw = {
      version: 1,
      nodes: [
        {
          id: 'gate',
          type: 'pipelineStep',
          position: { x: 0, y: 0 },
          data: {
            label: 'Approve deploy',
            stepKind: 'approval',
            approvalMessage: 'Deploy to production?',
          },
        },
        {
          id: 'health',
          type: 'pipelineStep',
          position: { x: 200, y: 0 },
          data: {
            label: 'Health check',
            stepKind: 'http-check',
            params: {
              url: 'https://example.com/health',
              expectedStatus: 200,
              maxRetries: 5,
            },
          },
        },
      ],
      edges: [],
    }

    const graph = parseAndValidateGraph(raw)
    const n0 = graph.nodes[0].data as import('shared/devPipelines/types').DevPipelineNodeData
    const n1 = graph.nodes[1].data as import('shared/devPipelines/types').DevPipelineNodeData
    expect(n0.stepKind).toBe('approval')
    expect(n0.approvalMessage).toBe('Deploy to production?')
    expect(n1.stepKind).toBe('http-check')
    expect(n1.params?.url).toBe('https://example.com/health')
    expect(n1.params?.maxRetries).toBe(5)
  })

  it('accepts http-check with empty url for draft save', () => {
    const raw = {
      version: 1,
      nodes: [
        {
          id: 'health',
          type: 'pipelineStep',
          position: { x: 0, y: 0 },
          data: { label: 'Health', stepKind: 'http-check', params: {} },
        },
      ],
      edges: [],
    }

    const graph = parseAndValidateGraph(raw)
    expect((graph.nodes[0].data as import('shared/devPipelines/types').DevPipelineNodeData).params?.url).toBe('')
  })

  it('validateGraphForRun rejects http-check without url', () => {
    const graph = parseAndValidateGraph({
      version: 1,
      nodes: [
        {
          id: 'health',
          type: 'pipelineStep',
          position: { x: 0, y: 0 },
          data: { label: 'Health', stepKind: 'http-check', params: { url: '' } },
        },
      ],
      edges: [],
    })

    expect(() => validateGraphForRun(graph)).toThrow(/params\.url/)
  })

  it('accepts an empty graph', () => {
    const graph = parseAndValidateGraph({ version: 1, nodes: [], edges: [] })
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('parses edge condition', () => {
    const raw = {
      version: 1,
      nodes: [
        { id: 'a', type: 'pipelineStep', position: { x: 0, y: 0 }, data: { label: 'A', stepKind: 'noop' } },
        { id: 'b', type: 'pipelineStep', position: { x: 200, y: 0 }, data: { label: 'B', stepKind: 'noop' } },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          type: 'labeled',
          data: { condition: 'on-failure' },
        },
      ],
    }

    const graph = parseAndValidateGraph(raw)
    expect(graph.edges[0].data?.condition).toBe('on-failure')
  })
})
