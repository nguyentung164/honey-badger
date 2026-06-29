import { createElectronRouter } from 'electron-router-dom'
// Tạo router
export const { Router, registerRoute, settings } = createElectronRouter({
  port: 4927,
  types: {
    ids: [
      'main',
      'code-diff-viewer',
      'show-log',
      'show-log-standalone',
      'app-logs',
      'check-coding-rules',
      'spotbugs',
      'commit-message-history',
      'merge-svn',
      'conflict-resolver',
      'task-management',
      'evm-tool',
      'gitblame',
      'dev-pipelines-standalone',
      'automation',
      'pr-manager',
    ],
  },
})
