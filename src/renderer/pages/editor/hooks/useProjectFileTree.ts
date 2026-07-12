import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createEmptyRoot,
  flattenFileTree,
  type FileTreeNode,
  upsertTreeChildren,
} from '@/pages/editor/lib/flattenFileTree'
import {
  directoryAncestorPaths,
  normalizeRepoRelativePath,
  parentDirectoryPath,
} from '@/pages/editor/lib/fileTreePaths'

const REVEAL_VISIBLE_MAX_FRAMES = 48

function findNode(root: FileTreeNode, path: string): FileTreeNode | null {
  if (root.relativePath === path) return root
  for (const child of root.children) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

function isPathVisibleInTree(root: FileTreeNode, expandedPaths: ReadonlySet<string>, relativePath: string): boolean {
  return flattenFileTree(root, expandedPaths).some(row => row.node.relativePath === relativePath)
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

async function waitUntilPathVisibleInTree(
  readState: () => { root: FileTreeNode; expandedPaths: ReadonlySet<string> },
  relativePath: string
): Promise<void> {
  for (let frame = 0; frame < REVEAL_VISIBLE_MAX_FRAMES; frame += 1) {
    const { root, expandedPaths } = readState()
    if (isPathVisibleInTree(root, expandedPaths, relativePath)) return
    await waitForNextFrame()
  }
}

export function useProjectFileTree(repoCwd: string) {
  const [root, setRoot] = useState<FileTreeNode>(() => createEmptyRoot())
  const rootRef = useRef(root)
  rootRef.current = root
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['']))
  const expandedPathsRef = useRef(expandedPaths)
  expandedPathsRef.current = expandedPaths
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set())

  const commitExpandedPaths = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setExpandedPaths(prev => {
      const next = updater(prev)
      expandedPathsRef.current = next
      return next
    })
  }, [])

  const loadChildren = useCallback(
    async (parentPath: string) => {
      if (!repoCwd) return

      const existing = findNode(rootRef.current, parentPath)
      if (existing?.kind === 'directory' && existing.childrenLoaded) return

      setLoadingPaths(prev => new Set(prev).add(parentPath))
      try {
        const result = await window.api.system.list_dir({ relativePath: parentPath, cwd: repoCwd })
        const children: FileTreeNode[] = result.entries.map(e => ({
          relativePath: e.relativePath,
          name: e.name,
          kind: e.kind,
          childrenLoaded: false,
          children: [],
        }))
        setRoot(prev => {
          const next = upsertTreeChildren(prev, parentPath, children)
          rootRef.current = next
          return next
        })
      } finally {
        setLoadingPaths(prev => {
          const next = new Set(prev)
          next.delete(parentPath)
          return next
        })
      }
    },
    [repoCwd]
  )

  const ensureDirectoryLoaded = useCallback(
    async (dirPath: string): Promise<void> => {
      const node = findNode(rootRef.current, dirPath)
      if (node?.kind === 'directory' && node.childrenLoaded) return

      if (dirPath !== '') {
        await ensureDirectoryLoaded(parentDirectoryPath(dirPath))
      }

      const refreshed = findNode(rootRef.current, dirPath)
      if (refreshed?.kind === 'directory' && refreshed.childrenLoaded) return
      await loadChildren(dirPath)
    },
    [loadChildren]
  )

  useEffect(() => {
    const emptyRoot = createEmptyRoot()
    setRoot(emptyRoot)
    rootRef.current = emptyRoot
    const nextExpanded = new Set([''])
    expandedPathsRef.current = nextExpanded
    setExpandedPaths(nextExpanded)
    if (!repoCwd) return

    const run = () => {
      void loadChildren('')
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(run, { timeout: 2000 })
      return () => cancelIdleCallback(idleId)
    }
    const timer = window.setTimeout(run, 150)
    return () => window.clearTimeout(timer)
  }, [repoCwd, loadChildren])

  const toggleExpand = useCallback(
    (path: string) => {
      commitExpandedPaths(prev => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })
      const node = findNode(root, path)
      if (node?.kind === 'directory' && !node.childrenLoaded) {
        void loadChildren(path)
      }
    },
    [commitExpandedPaths, loadChildren, root]
  )

  const refresh = useCallback(() => {
    const prevExpanded = [...expandedPathsRef.current]
    const emptyRoot = createEmptyRoot()
    setRoot(emptyRoot)
    rootRef.current = emptyRoot

    void (async () => {
      await loadChildren('')
      const nextExpanded = new Set<string>([''])
      const dirs = prevExpanded.filter(p => p !== '').sort((a, b) => a.length - b.length)
      for (const path of dirs) {
        const ancestors = directoryAncestorPaths(path)
        let valid = true
        for (const ancestor of ancestors) {
          await loadChildren(ancestor)
          if (!findNode(rootRef.current, ancestor)) {
            valid = false
            break
          }
        }
        if (!valid) continue
        const node = findNode(rootRef.current, path)
        if (node?.kind === 'directory') {
          for (const ancestor of ancestors) nextExpanded.add(ancestor)
          nextExpanded.add(path)
        }
      }
      commitExpandedPaths(() => nextExpanded)
    })()
  }, [commitExpandedPaths, loadChildren])

  const rows = useMemo(() => flattenFileTree(root, expandedPaths), [root, expandedPaths])

  const ensurePathRevealed = useCallback(
    async (relativePath: string) => {
      if (!repoCwd) return
      const normalized = normalizeRepoRelativePath(relativePath)
      if (!normalized) return

      const ancestors = directoryAncestorPaths(normalized)

      commitExpandedPaths(prev => {
        const next = new Set(prev)
        for (const dirPath of ancestors) {
          next.add(dirPath)
        }
        return next
      })

      for (const dirPath of ancestors) {
        await ensureDirectoryLoaded(dirPath)
      }

      await waitUntilPathVisibleInTree(
        () => ({ root: rootRef.current, expandedPaths: expandedPathsRef.current }),
        normalized
      )
    },
    [commitExpandedPaths, ensureDirectoryLoaded, repoCwd]
  )

  return {
    rows,
    expandedPaths,
    loadingPaths,
    toggleExpand,
    refresh,
    loadChildren,
    ensurePathRevealed,
  }
}
