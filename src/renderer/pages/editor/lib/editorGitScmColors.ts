/** VS Code–aligned SCM decoration colors (overview ruler + gutter bars). */
export const EDITOR_GIT_SCM_COLORS = {
  modified: {
    gutter: '#1b81a8',
    ruler: '#1b81a8b3',
    minimap: '#1b81a8b3',
  },
  added: {
    gutter: '#487e02',
    ruler: '#487e02b3',
    minimap: '#487e02b3',
  },
  deleted: {
    gutter: '#ad0707',
    ruler: '#ad0707b3',
    minimap: '#ad0707b3',
  },
} as const

export type EditorGitChangeKind = keyof typeof EDITOR_GIT_SCM_COLORS
