import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeRepoRelativePath } from '@/pages/editor/lib/fileTreePaths'
import type { FileTreeRow } from '@/pages/editor/lib/flattenFileTree'

export type ExplorerRevealScroll = {
  /** Repo-relative path to scroll into view (stable across row rebuilds). */
  path: string
  sequence: number
}

type UseExplorerAutoRevealOptions = {
  enabled: boolean
  /** Bumps on every editor tab switch — retriggers reveal even if path is unchanged. */
  activeTabId: string | null | undefined
  activeRelativePath: string | undefined
  /** Manual reveal (breadcrumb / command) — runs even when auto-reveal is off. */
  requestedReveal?: { path: string; seq: number } | null
  rows: readonly FileTreeRow[]
  ensurePathRevealed: (relativePath: string) => Promise<void>
}

const REVEAL_SCROLL_MAX_FRAMES = 48

function findRowPathIndex(rows: readonly FileTreeRow[], relativePath: string): number {
  return rows.findIndex(r => r.node.relativePath === relativePath)
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

/**
 * VS Code `explorer.autoReveal`: expand ancestors, select file, scroll virtual tree.
 */
export function useExplorerAutoReveal({
  enabled,
  activeTabId,
  activeRelativePath,
  requestedReveal,
  rows,
  ensurePathRevealed,
}: UseExplorerAutoRevealOptions) {
  const [revealScroll, setRevealScroll] = useState<ExplorerRevealScroll | null>(null)
  const scrollSeqRef = useRef(0)
  const rowsRef = useRef(rows)
  const ensurePathRevealedRef = useRef(ensurePathRevealed)
  const revealTargetRef = useRef<string | null>(null)
  const revealGenRef = useRef(0)
  rowsRef.current = rows
  ensurePathRevealedRef.current = ensurePathRevealed

  const scrollToPathIfVisible = useCallback((path: string) => {
    if (findRowPathIndex(rowsRef.current, path) < 0) return false
    scrollSeqRef.current += 1
    setRevealScroll({ path, sequence: scrollSeqRef.current })
    return true
  }, [])

  const scrollToPathWithRetry = useCallback(
    async (path: string, gen: number) => {
      for (let frame = 0; frame < REVEAL_SCROLL_MAX_FRAMES; frame += 1) {
        if (revealGenRef.current !== gen) return
        if (scrollToPathIfVisible(path)) return
        await waitForNextFrame()
      }
    },
    [scrollToPathIfVisible]
  )

  const runReveal = useCallback(
    (relativePath: string, expand: boolean) => {
      const normalized = normalizeRepoRelativePath(relativePath)
      if (!normalized) {
        revealTargetRef.current = null
        setRevealScroll(null)
        return
      }

      const gen = ++revealGenRef.current
      revealTargetRef.current = normalized
      void scrollToPathWithRetry(normalized, gen)

      if (!expand) return

      void ensurePathRevealedRef.current(normalized).then(() => {
        void scrollToPathWithRetry(normalized, gen)
      })
    },
    [scrollToPathWithRetry]
  )

  const cancelRevealSession = useCallback(() => {
    revealGenRef.current += 1
    revealTargetRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled || !activeRelativePath) {
      revealTargetRef.current = null
      setRevealScroll(null)
      return
    }

    runReveal(activeRelativePath, true)
    return () => {
      revealGenRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runReveal uses refs; tab id forces re-reveal
  }, [activeRelativePath, activeTabId, enabled])

  useEffect(() => {
    if (!requestedReveal) return
    runReveal(requestedReveal.path, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedReveal])

  useEffect(() => {
    const target = revealTargetRef.current
    if (!target) return
    scrollToPathIfVisible(target)
  }, [rows, scrollToPathIfVisible])

  return { revealScroll, cancelRevealSession }
}
