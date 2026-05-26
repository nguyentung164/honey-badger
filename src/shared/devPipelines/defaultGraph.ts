import type { DevPipelineGraphJson } from './types'

export function createDefaultDevPipelineGraph(): DevPipelineGraphJson {
  return {
    version: 1,
    nodes: [
      {
        id: 'step_build',
        type: 'pipelineStep',
        position: { x: 60, y: 100 },
        data: {
          label: 'Build',
          stepKind: 'shell',
          command: 'echo [Dev Pipelines] Replace with: pnpm build',
          waitForExit: true,
        },
      },
      {
        id: 'step_services',
        type: 'pipelineStep',
        position: { x: 320, y: 100 },
        data: {
          label: 'Services',
          stepKind: 'shell',
          command: `node -e "setInterval(() => console.log('tick'), 2000)"`,
          waitForExit: false,
        },
      },
      {
        id: 'step_deploy',
        type: 'pipelineStep',
        position: { x: 580, y: 100 },
        data: {
          label: 'Deploy',
          stepKind: 'shell',
          command: 'echo [Dev Pipelines] Replace with your deploy command or .bat path',
          waitForExit: true,
        },
      },
    ],
    edges: [
      { id: 'e_build_test', source: 'step_build', target: 'step_services' },
      { id: 'e_test_deploy', source: 'step_services', target: 'step_deploy' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
