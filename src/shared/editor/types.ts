export type ListDirEntry = {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
}

export type ListDirResult = {
  entries: ListDirEntry[]
}

export type SearchInFilesMatch = {
  relativePath: string
  line: number
  column: number
  preview: string
}

export type SearchInFilesOptions = {
  cwd?: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  maxResults?: number
  /** Comma-separated globs (VS Code “files to include”). */
  includePattern?: string
  /** Comma-separated globs (VS Code “files to exclude”). */
  excludePattern?: string
}

export type SearchInFilesResult = {
  matches: SearchInFilesMatch[]
  truncated: boolean
}

export type ReplaceInFilesPayload = SearchInFilesOptions & {
  query: string
  replace: string
  /** When set, only these workspace-relative paths are updated. */
  relativePaths?: string[]
}

export type ReplaceInFilesResult = {
  fileCount: number
  replacementCount: number
  relativePaths: string[]
  failures: Array<{ relativePath: string; error: string }>
}

export type WorkspaceFileChangedEvent = {
  relativePath: string
  event: 'add' | 'change' | 'unlink'
}

export type ListWorkspaceFilesResult = {
  files: string[]
  truncated: boolean
}
