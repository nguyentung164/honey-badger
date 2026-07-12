import { EDITOR_OPEN_FILE_MAX_BYTES, LSP_LARGE_FILE_BYTES } from 'shared/fileUri'
import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { getEditorLanguage } from '@/lib/monacoLanguage'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { compareSideModelPath } from '@/pages/editor/lib/editorCompareModels'
import {
  clearViewStateForTab,
  disposeCompareModels,
  disposeTextModel,
  ensureTextModel,
  getModelAlternativeVersionId,
  getModelText,
  renameModelInRegistry,
} from '@/pages/editor/lib/editorModelRegistry'
import { markPathSaving, unmarkPathSaving } from '@/pages/editor/lib/editorSavingPaths'
import {
  flushPersistedSession,
  normalizeEditorRepoKey,
  readPersistedMultiRootSession,
  readPersistedSession,
  schedulePersistedMultiRootSession,
  schedulePersistedSession,
} from '@/pages/editor/lib/editorSessionPersist'
import { insertTabAtIndex, moveTabToStickyEnd, resolveReopenInsertIndex } from '@/pages/editor/lib/editorTabPlacement'
import { recordEditorTabActivation, removeEditorTabFromActivation, resolveNextActiveTabAfterClose, seedEditorTabActivation } from '@/pages/editor/lib/editorTabActivation'
import {
  clearClosedEditorTabsHistory,
  recordClosedEditorTab,
  removeClosedEditorTabsForPath,
  runIgnoringClosedEditorRecording,
  takeLastClosedEditorsBatch,
  hasClosedEditorTabs,
} from '@/pages/editor/lib/editorClosedTabsHistory'
import {
  commitModelBaseline,
  forceBufferDirtyState,
  getModelBaseline,
  isDirtyByVersion,
  registerModelBaseline,
  renameModelPath,
  unregisterModel,
} from '@/pages/editor/lib/editorTextModels'
import { type EditorTab, MAX_EDITOR_TABS, type OpenCompareOptions, type OpenFileOptions, tabIdForCompare, tabIdForResource, tabRepoRoot } from '@/pages/editor/lib/editorWorkspaceTypes'
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'svg',
  'zip',
  'gz',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'mp3',
  'mp4',
  'pdf',
])

type EditorWorkspaceState = {
  repoCwd: string
  multiRootWorkspace: boolean
  workspaceSessionKey: string | null
  tabs: EditorTab[]
  activeTabId: string | null
  tabsMetaRevision: number
  setRepoCwd: (cwd: string) => void
  initMultiRootWorkspace: (sessionKey: string, folderRoots: string[]) => void
  openFile: (relativePath: string, opts?: OpenFileOptions) => Promise<void>
  consumeTabReveal: (tabId: string) => void
  openCompare: (leftPath: string, rightPath: string, opts?: OpenCompareOptions) => Promise<void>
  openCompareSnapshots: (leftPath: string, rightPath: string, leftContent: string, rightContent: string) => Promise<void>
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  pinTab: (tabId: string) => void
  syncTabDirty: (tabId: string, alternativeVersionId: number) => void
  saveTab: (tabId: string) => Promise<boolean>
  saveActiveTab: () => Promise<boolean>
  hasDirtyTabs: () => boolean
  reloadTabFromDisk: (relativePath: string, preloadedContent?: string, repoRootHint?: string) => Promise<void>
  syncTabFromDiskQuiet: (relativePath: string, preloadedContent?: string, repoRootHint?: string) => Promise<void>
  reloadTabFromDiskIfChanged: (relativePath: string, repoRootHint?: string) => Promise<void>
  reconcileDirtyTabIfDiskMatchesBuffer: (tabId: string, relativePath: string) => Promise<boolean>
  revertActiveTabFromDisk: () => Promise<void>
  markTabOutOfSyncWithDisk: (relativePath: string, repoRootHint?: string) => void
  prefetchTabContent: (tabId: string) => Promise<boolean>
  revertDirtyTabs: () => void
  renameExplorerPath: (from: string, to: string) => void
  closeTabsForExplorerDelete: (relativePath: string, isDir: boolean) => void
  reopenLastClosedEditor: () => Promise<void>
  resetForRepo: (cwd: string) => void
}

function createStubTab(relativePath: string, repoRoot: string): EditorTab {
  return {
    id: tabIdForResource(repoRoot, relativePath),
    relativePath,
    repoRoot,
    languageId: 'plaintext',
    isDirty: false,
    isLoading: false,
    contentLoaded: false,
    isPreview: false,
    isPinned: true,
    isSticky: false,
    kind: 'text',
    version: 1,
    loadGeneration: 0,
  }
}

function isLikelyBinaryPath(relativePath: string): boolean {
  const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTENSIONS.has(ext)
}

async function detectTextFileMeta(relativePath: string, repoCwd: string): Promise<{ size: number; mtimeMs: number | null; kind: 'text' | 'image' | 'binary' }> {
  const detected = await window.api.system.detect_file_kind(relativePath, { cwd: repoCwd })
  return {
    size: detected.size ?? 0,
    mtimeMs: detected.mtimeMs ?? null,
    kind: detected.kind ?? 'text',
  }
}

function emitLargeFileBlocked(relativePath: string, size: number, opts?: OpenFileOptions): void {
  window.dispatchEvent(
    new CustomEvent('editor-large-file-blocked', {
      detail: { relativePath, size, opts },
    })
  )
}

function bumpMeta(revision: number): number {
  return revision + 1
}

function normalizeExplorerPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function findTabForRepoPath(tabs: readonly EditorTab[], relativePath: string, repoCwd: string): EditorTab | undefined {
  const normalized = relativePath.replace(/\\/g, '/')
  const repoKey = normalizeEditorRepoKey(repoCwd)
  return tabs.find(t => t.relativePath.replace(/\\/g, '/') === normalized && normalizeEditorRepoKey(tabRepoRoot(t, repoCwd)) === repoKey)
}

function remapPathForRename(path: string, from: string, to: string): string | null {
  const normalized = normalizeExplorerPath(path)
  const fromNorm = normalizeExplorerPath(from)
  const toNorm = normalizeExplorerPath(to)
  if (normalized === fromNorm) return toNorm
  if (normalized.startsWith(`${fromNorm}/`)) return `${toNorm}${normalized.slice(fromNorm.length)}`
  return null
}

function pinTabFields(): Pick<EditorTab, 'isPreview' | 'isPinned'> {
  return { isPreview: false, isPinned: true }
}

function stickyTabFields(): Pick<EditorTab, 'isPreview' | 'isPinned' | 'isSticky'> {
  return { isPreview: false, isPinned: true, isSticky: true }
}

async function syncTextModelFromDisk(repoCwd: string, relativePath: string, baseline: string, languageId: string, loadGeneration: number): Promise<void> {
  const monaco = await import('monaco-editor')
  ensureTextModel(monaco, repoCwd, relativePath, baseline, languageId, loadGeneration)
}

function resolveTabContent(repoCwd: string, tab: EditorTab, activeTabId: string | null): string {
  if (tab.kind !== 'text') return ''
  if (activeTabId === tab.id) {
    return editorCommandBridge.get()?.getValue() ?? getModelText(repoCwd, tab.relativePath) ?? getModelBaseline(repoCwd, tab.relativePath)
  }
  return getModelText(repoCwd, tab.relativePath) ?? getModelBaseline(repoCwd, tab.relativePath)
}

const loadTabInflight = new Map<string, Promise<void>>()
const reloadIfChangedInflight = new Map<string, Promise<void>>()

async function loadTabContentForStore(
  get: () => EditorWorkspaceState,
  set: (partial: Partial<EditorWorkspaceState> | ((state: EditorWorkspaceState) => Partial<EditorWorkspaceState>)) => void,
  tabId: string,
  opts?: OpenFileOptions
): Promise<void> {
  const inflight = loadTabInflight.get(tabId)
  if (inflight) {
    await inflight
    return
  }

  const promise = loadTabContentForStoreInner(get, set, tabId, opts)
  loadTabInflight.set(tabId, promise)
  try {
    await promise
  } finally {
    loadTabInflight.delete(tabId)
  }
}

async function loadTabContentForStoreInner(
  get: () => EditorWorkspaceState,
  set: (partial: Partial<EditorWorkspaceState> | ((state: EditorWorkspaceState) => Partial<EditorWorkspaceState>)) => void,
  tabId: string,
  opts?: OpenFileOptions
): Promise<void> {
  const { tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
  const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
  if (!tab || !repoCwd || tab.contentLoaded || tab.kind === 'compare') return

  set(state => ({
    tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    tabs: state.tabs.map(t =>
      t.id === tabId
        ? {
          ...t,
          isLoading: true,
          reveal: opts?.line ? { line: opts.line, column: opts.column ?? 1 } : t.reveal,
        }
        : t
    ),
  }))

  try {
    if (isLikelyBinaryPath(tab.relativePath)) {
      const loadGeneration = registerModelBaseline(repoCwd, tab.relativePath, '')
      set(state => ({
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
        tabs: state.tabs.map(t =>
          t.id === tabId
            ? {
              ...t,
              isLoading: false,
              contentLoaded: true,
              kind: 'binary',
              languageId: 'plaintext',
              loadGeneration,
            }
            : t
        ),
      }))
      return
    }

    const languageId = getEditorLanguage(tab.relativePath)
    const cachedModelText = getModelText(repoCwd, tab.relativePath)
    const content = cachedModelText ?? (await window.api.system.read_file(tab.relativePath, { cwd: repoCwd }))
    const baseline = content.replace(/\r\n/g, '\n')
    const meta = await detectTextFileMeta(tab.relativePath, repoCwd)
    const loadGeneration = registerModelBaseline(repoCwd, tab.relativePath, baseline, meta.mtimeMs)
    await syncTextModelFromDisk(repoCwd, tab.relativePath, baseline, languageId, loadGeneration)

    set(state => {
      const nextTabs = state.tabs.map(t =>
        t.id === tabId
          ? {
            ...t,
            languageId,
            isLoading: false,
            contentLoaded: true,
            kind: 'text' as const,
            loadGeneration,
          }
          : t
      )
      persistWorkspaceSession(state, nextTabs, state.activeTabId)
      return { tabs: nextTabs, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  } catch {
    toast.error(i18n.t('editor.openFileFailed'))
    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive ? resolveNextActiveTabAfterClose(tabId, state.tabs, next) : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(
          activeTabId,
          next.map(t => t.id)
        )
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  }
}

async function loadCompareTabContent(
  get: () => EditorWorkspaceState,
  set: (partial: Partial<EditorWorkspaceState> | ((state: EditorWorkspaceState) => Partial<EditorWorkspaceState>)) => void,
  tabId: string
): Promise<void> {
  const { tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
  const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
  if (!tab || !repoCwd || tab.kind !== 'compare' || !tab.compareWithPath || tab.contentLoaded) return

  set(state => ({
    tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isLoading: true } : t)),
  }))

  try {
    const [leftContent, rightContent] = await Promise.all([
      window.api.system.read_file(tab.relativePath, { cwd: repoCwd }),
      window.api.system.read_file(tab.compareWithPath, { cwd: repoCwd }),
    ])
    const left = leftContent.replace(/\r\n/g, '\n')
    const right = rightContent.replace(/\r\n/g, '\n')
    const languageId = getEditorLanguage(tab.relativePath)
    const leftPath = compareSideModelPath(tabId, 'left')
    const rightPath = compareSideModelPath(tabId, 'right')
    const leftGen = registerModelBaseline(repoCwd, leftPath, left)
    const rightGen = registerModelBaseline(repoCwd, rightPath, right)
    await syncTextModelFromDisk(repoCwd, leftPath, left, languageId, leftGen)
    await syncTextModelFromDisk(repoCwd, rightPath, right, languageId, rightGen)

    set(state => ({
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? {
            ...t,
            languageId,
            isLoading: false,
            contentLoaded: true,
            loadGeneration: Math.max(leftGen, rightGen),
          }
          : t
      ),
    }))
  } catch {
    toast.error(i18n.t('editor.openFileFailed'))
    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive ? resolveNextActiveTabAfterClose(tabId, state.tabs, next) : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(
          activeTabId,
          next.map(t => t.id)
        )
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  }
}

async function loadCompareTabContentFromMemory(
  get: () => EditorWorkspaceState,
  set: (partial: Partial<EditorWorkspaceState> | ((state: EditorWorkspaceState) => Partial<EditorWorkspaceState>)) => void,
  tabId: string,
  leftContent: string,
  rightContent: string
): Promise<void> {
  const { tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
  const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
  if (!tab || !repoCwd || tab.kind !== 'compare' || !tab.compareWithPath || tab.contentLoaded) return

  set(state => ({
    tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isLoading: true } : t)),
  }))

  try {
    const left = leftContent.replace(/\r\n/g, '\n')
    const right = rightContent.replace(/\r\n/g, '\n')
    const languageId = getEditorLanguage(tab.relativePath)
    const leftPath = compareSideModelPath(tabId, 'left')
    const rightPath = compareSideModelPath(tabId, 'right')
    const leftGen = registerModelBaseline(repoCwd, leftPath, left)
    const rightGen = registerModelBaseline(repoCwd, rightPath, right)
    await syncTextModelFromDisk(repoCwd, leftPath, left, languageId, leftGen)
    await syncTextModelFromDisk(repoCwd, rightPath, right, languageId, rightGen)

    set(state => ({
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? {
            ...t,
            languageId,
            isLoading: false,
            contentLoaded: true,
            loadGeneration: Math.max(leftGen, rightGen),
          }
          : t
      ),
    }))
  } catch {
    toast.error(i18n.t('editor.openFileFailed'))
    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive ? resolveNextActiveTabAfterClose(tabId, state.tabs, next) : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(
          activeTabId,
          next.map(t => t.id)
        )
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  }
}

function persistWorkspaceSession(state: EditorWorkspaceState, tabs: EditorTab[], activeTabId: string | null) {
  if (state.multiRootWorkspace && state.workspaceSessionKey) {
    schedulePersistedMultiRootSession(state.workspaceSessionKey, tabs, activeTabId)
    return
  }
  const active = tabs.find(t => t.id === activeTabId)
  if (state.repoCwd) {
    schedulePersistedSession(state.repoCwd, tabs, active?.relativePath ?? null)
  }
}

export const useEditorWorkspace = create<EditorWorkspaceState>((set, get) => ({
  repoCwd: '',
  multiRootWorkspace: false,
  workspaceSessionKey: null,
  tabs: [],
  activeTabId: null,
  tabsMetaRevision: 0,

  initMultiRootWorkspace: (sessionKey, folderRoots) => {
    const roots = folderRoots.map(r => r.trim()).filter(Boolean)
    if (!sessionKey.trim() || roots.length === 0) return

    const prev = get()
    if (
      prev.multiRootWorkspace &&
      prev.workspaceSessionKey === sessionKey &&
      normalizeEditorRepoKey(prev.repoCwd) &&
      roots.some(r => normalizeEditorRepoKey(r) === normalizeEditorRepoKey(prev.repoCwd))
    ) {
      return
    }

    if (prev.repoCwd && !prev.multiRootWorkspace) {
      const active = prev.tabs.find(t => t.id === prev.activeTabId)
      flushPersistedSession(prev.repoCwd, prev.tabs, active?.relativePath ?? null)
    }

    clearClosedEditorTabsHistory()

    const restoreTabs = useEditorSettings.getState().restoreEditorTabs
    const session = readPersistedMultiRootSession(sessionKey, roots, restoreTabs)
    const limited = session.tabs.slice(0, MAX_EDITOR_TABS)
    const stubs = limited.map(entry => createStubTab(entry.relativePath, entry.repoRoot))
    const activeId = session.activeTabId && stubs.some(s => s.id === session.activeTabId) ? session.activeTabId : (stubs[0]?.id ?? null)
    const focusedCwd = stubs.find(s => s.id === activeId)?.repoRoot ?? roots[0]

    set(state => ({
      multiRootWorkspace: true,
      workspaceSessionKey: sessionKey,
      repoCwd: focusedCwd,
      tabs: stubs,
      activeTabId: activeId,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))

    seedEditorTabActivation(
      stubs.map(s => s.id),
      activeId
    )

    if (activeId) {
      void loadTabContentForStore(get, set, activeId)
    }
  },

  setRepoCwd: cwd => {
    const state = get()
    if (!cwd || state.repoCwd === cwd || normalizeEditorRepoKey(state.repoCwd) === normalizeEditorRepoKey(cwd)) return
    if (state.multiRootWorkspace) {
      set({ repoCwd: cwd })
      return
    }
    if (state.repoCwd) {
      const active = state.tabs.find(t => t.id === state.activeTabId)
      flushPersistedSession(state.repoCwd, state.tabs, active?.relativePath ?? null)
      editorLanguageService.closeAllDocuments()
    }
    get().resetForRepo(cwd)
  },

  resetForRepo: cwd => {
    clearClosedEditorTabsHistory()
    const restoreTabs = useEditorSettings.getState().restoreEditorTabs
    const { paths, activePath } = readPersistedSession(cwd, restoreTabs)
    const limited = paths.slice(0, MAX_EDITOR_TABS)
    const active = activePath && limited.includes(activePath) ? activePath : (limited[0] ?? null)
    const stubs = limited.map(p => createStubTab(p, cwd))

    set(state => ({
      multiRootWorkspace: false,
      workspaceSessionKey: null,
      repoCwd: cwd,
      tabs: stubs,
      activeTabId: active ? tabIdForResource(cwd, active) : null,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))

    seedEditorTabActivation(
      stubs.map(s => s.id),
      active ? tabIdForResource(cwd, active) : null
    )

    if (active) {
      void loadTabContentForStore(get, set, tabIdForResource(cwd, active))
    }
  },

  openFile: async (relativePath, opts) => {
    const normalized = relativePath.replace(/\\/g, '/')
    let { tabs } = get()
    const repoRoot = (opts?.repoRoot ?? get().repoCwd).trim()
    if (!repoRoot) return

    const pin = opts?.pin === true || opts?.preview === false
    const preview = opts?.preview === true && !pin
    const sticky = opts?.sticky === true
    const id = tabIdForResource(repoRoot, normalized)

    const existing = tabs.find(t => t.id === id)
    if (existing) {
      const nextTabs = get().tabs.map(t => {
        if (t.id !== existing.id) return t
        return {
          ...t,
          ...(pin ? pinTabFields() : {}),
          ...(opts?.line ? { reveal: { line: opts.line, column: opts.column ?? 1 } } : {}),
        }
      })
      set(state => ({
        activeTabId: existing.id,
        repoCwd: repoRoot,
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
        tabs: nextTabs,
      }))
      recordEditorTabActivation(
        existing.id,
        nextTabs.map(t => t.id)
      )
      persistWorkspaceSession(get(), get().tabs, existing.id)
      if (!existing.contentLoaded) {
        await loadTabContentForStore(get, set, existing.id, opts)
      }
      return
    }

    const previewSlot = preview ? tabs.find(t => t.isPreview && !t.isPinned && !t.isDirty) : null
    if (previewSlot) {
      clearViewStateForTab(previewSlot.id)
      removeEditorTabFromActivation(previewSlot.id)
      tabs = tabs.filter(t => t.id !== previewSlot.id)
    } else if (tabs.length >= MAX_EDITOR_TABS) {
      toast.error(i18n.t('editor.maxTabsReached', { count: MAX_EDITOR_TABS }))
      return
    }

    if (!opts?.forceLarge && !isLikelyBinaryPath(normalized)) {
      const meta = await detectTextFileMeta(normalized, repoRoot)
      if (meta.size > EDITOR_OPEN_FILE_MAX_BYTES) {
        emitLargeFileBlocked(normalized, meta.size, opts)
        return
      }
    }

    const placeholder: EditorTab = {
      id,
      relativePath: normalized,
      repoRoot,
      languageId: 'plaintext',
      isDirty: false,
      isLoading: false,
      contentLoaded: false,
      isPreview: preview,
      isPinned: !preview,
      isSticky: sticky,
      kind: 'text',
      version: 1,
      loadGeneration: 0,
      reveal: opts?.line ? { line: opts.line, column: opts.column ?? 1 } : undefined,
    }

    const insertIndex = resolveReopenInsertIndex(tabs, opts?.insertIndex ?? tabs.length, sticky)
    const nextTabs = insertTabAtIndex(tabs, placeholder, insertIndex)
    set(state => ({
      tabs: nextTabs,
      activeTabId: id,
      repoCwd: repoRoot,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(
      id,
      nextTabs.map(t => t.id)
    )
    persistWorkspaceSession(get(), nextTabs, id)
    await loadTabContentForStore(get, set, id, opts)
  },

  consumeTabReveal: tabId => {
    set(state => ({
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, reveal: undefined } : t)),
    }))
  },

  openCompare: async (leftPath, rightPath, opts) => {
    const left = leftPath.replace(/\\/g, '/')
    const right = rightPath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd || left === right) return

    const sticky = opts?.sticky === true
    const id = tabIdForCompare(repoCwd, left, right)
    const existing = tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: existing.id, repoCwd })
      recordEditorTabActivation(
        existing.id,
        get().tabs.map(t => t.id)
      )
      if (!existing.contentLoaded) {
        await loadCompareTabContent(get, set, id)
      }
      return
    }

    if (tabs.length >= MAX_EDITOR_TABS) {
      toast.error(i18n.t('editor.maxTabsReached', { count: MAX_EDITOR_TABS }))
      return
    }

    const placeholder: EditorTab = {
      id,
      relativePath: left,
      repoRoot: repoCwd,
      compareWithPath: right,
      languageId: getEditorLanguage(left),
      isDirty: false,
      isLoading: true,
      contentLoaded: false,
      isPreview: false,
      isPinned: true,
      isSticky: sticky,
      kind: 'compare',
      version: 1,
      loadGeneration: 0,
    }

    const insertIndex = resolveReopenInsertIndex(tabs, opts?.insertIndex ?? tabs.length, sticky)
    const nextTabs = insertTabAtIndex(tabs, placeholder, insertIndex)

    set(state => ({
      tabs: nextTabs,
      activeTabId: id,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(
      id,
      nextTabs.map(t => t.id)
    )
    await loadCompareTabContent(get, set, id)
  },

  openCompareSnapshots: async (leftPath, rightPath, leftContent, rightContent) => {
    const left = leftPath.replace(/\\/g, '/')
    const right = rightPath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd || left === right) return

    const id = tabIdForCompare(repoCwd, left, right)
    const existing = tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: existing.id, repoCwd })
      recordEditorTabActivation(
        existing.id,
        get().tabs.map(t => t.id)
      )
      if (!existing.contentLoaded) {
        await loadCompareTabContentFromMemory(get, set, id, leftContent, rightContent)
      }
      return
    }

    if (tabs.length >= MAX_EDITOR_TABS) {
      toast.error(i18n.t('editor.maxTabsReached', { count: MAX_EDITOR_TABS }))
      return
    }

    const placeholder: EditorTab = {
      id,
      relativePath: left,
      repoRoot: repoCwd,
      compareWithPath: right,
      languageId: getEditorLanguage(left),
      isDirty: false,
      isLoading: true,
      contentLoaded: false,
      isPreview: false,
      isPinned: true,
      isSticky: false,
      kind: 'compare',
      version: 1,
      loadGeneration: 0,
    }

    set(state => ({
      tabs: [...tabs, placeholder],
      activeTabId: id,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(
      id,
      [...get().tabs].map(t => t.id)
    )
    await loadCompareTabContentFromMemory(get, set, id, leftContent, rightContent)
  },

  closeTab: tabId => {
    const { tabs } = get()
    const tab = tabs.find(t => t.id === tabId)
    const tabIndex = tabs.findIndex(t => t.id === tabId)
    const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
    if (tab && repoCwd && tab.kind === 'compare') {
      void import('monaco-editor').then(monaco => disposeCompareModels(repoCwd, tab.id, monaco))
    }
    if (tab && tabIndex >= 0) {
      recordClosedEditorTab(
        {
          kind: tab.kind,
          relativePath: tab.relativePath,
          repoRoot: tabRepoRoot(tab, get().repoCwd),
          compareWithPath: tab.compareWithPath,
          reveal: tab.reveal,
          isSticky: tab.isSticky ?? false,
        },
        tabIndex
      )
    }
    clearViewStateForTab(tabId)

    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive ? resolveNextActiveTabAfterClose(tabId, state.tabs, next) : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(
          activeTabId,
          next.map(t => t.id)
        )
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      const active = next.find(t => t.id === activeTabId)
      const nextState = {
        tabs: next,
        activeTabId,
        repoCwd: active ? tabRepoRoot(active, state.repoCwd) : state.repoCwd,
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }
      persistWorkspaceSession({ ...state, ...nextState }, next, activeTabId)
      return nextState
    })
  },

  setActiveTab: tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    set(state => {
      if (state.activeTabId === tabId) return state
      return {
        activeTabId: tabId,
        repoCwd: tab ? tabRepoRoot(tab, state.repoCwd) : state.repoCwd,
      }
    })
    if (tab) {
      recordEditorTabActivation(
        tabId,
        get().tabs.map(t => t.id)
      )
      persistWorkspaceSession(get(), get().tabs, tabId)
      if (!tab.contentLoaded) {
        if (tab.kind === 'compare') void loadCompareTabContent(get, set, tabId)
        else void loadTabContentForStore(get, set, tabId)
      }
    }
  },

  pinTab: tabId => {
    set(state => {
      if (!state.tabs.some(t => t.id === tabId)) return state
      const withPin = state.tabs.map(t => (t.id === tabId ? { ...t, ...stickyTabFields() } : t))
      return {
        tabs: moveTabToStickyEnd(withPin, tabId),
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }
    })
    persistWorkspaceSession(get(), get().tabs, tabId)
  },

  syncTabDirty: (tabId, alternativeVersionId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
    if (!repoCwd) return
    if (tab?.kind !== 'text') return
    const isDirty = isDirtyByVersion(repoCwd, tab.relativePath, alternativeVersionId)

    set(state => {
      let changed = false
      const tabs = state.tabs.map(t => {
        if (t.id !== tabId) return t
        if (t.isDirty === isDirty) return t
        changed = true
        return {
          ...t,
          isDirty,
          ...(isDirty && t.isPreview ? pinTabFields() : {}),
        }
      })
      if (!changed) return state
      return { tabs, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  },

  saveTab: async tabId => {
    const settings = useEditorSettings.getState()
    const { activeTabId } = get()
    const tab = get().tabs.find(t => t.id === tabId)
    const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
    if (tab?.kind !== 'text' || !repoCwd) return true

    const { applyEditorSaveParticipantsBeforeWrite } = await import('@/pages/editor/lib/editorSaveParticipants')
    await applyEditorSaveParticipantsBeforeWrite({
      repoCwd,
      tabId,
      relativePath: tab.relativePath,
      languageId: tab.languageId,
      activeTabId,
      formatOnSave: settings.formatOnSave,
      trimTrailingWhitespaceOnSave: settings.trimTrailingWhitespaceOnSave,
      insertFinalNewlineOnSave: settings.insertFinalNewlineOnSave,
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
    })

    const content = resolveTabContent(repoCwd, tab, activeTabId)
    const snapshotVersionId = getModelAlternativeVersionId(repoCwd, tab.relativePath)

    const { checkDirtyWriteOnSave } = await import('@/pages/editor/lib/editorDirtyWrite')
    let dirtyWriteCheck = await checkDirtyWriteOnSave(repoCwd, tab.relativePath, content)

    if (dirtyWriteCheck.action === 'confirm') {
      const { requestDirtyWriteChoice } = await import('@/pages/editor/lib/editorDirtyWritePrompt')
      const fileName = tab.relativePath.split('/').pop() ?? tab.relativePath
      const tabRoot = tabRepoRoot(tab, get().repoCwd)

      while (dirtyWriteCheck.action === 'confirm') {
        const shownDiskContent = dirtyWriteCheck.diskContent
        const choice = await requestDirtyWriteChoice({
          relativePath: tab.relativePath,
          fileName,
          diskContent: dirtyWriteCheck.diskContent,
          editorContent: dirtyWriteCheck.editorContent,
        })
        if (choice === 'cancel') return false
        if (choice === 'revert') {
          await get().reloadTabFromDisk(tab.relativePath, undefined, tabRoot)
          return false
        }
        if (choice === 'compare') {
          const diskLabel = `${tab.relativePath} (disk)`
          const editorLabel = `${tab.relativePath} (editor)`
          await get().openCompareSnapshots(diskLabel, editorLabel, dirtyWriteCheck.diskContent, dirtyWriteCheck.editorContent)
          return false
        }
        // overwrite — re-check disk before writing (TOCTOU)
        dirtyWriteCheck = await checkDirtyWriteOnSave(repoCwd, tab.relativePath, content)
        if (dirtyWriteCheck.action === 'confirm' && dirtyWriteCheck.diskContent !== shownDiskContent) {
          continue
        }
        break
      }
    }

    if (dirtyWriteCheck.action === 'noop') {
      // Reuse the mtime already fetched by the dirty-write check — no duplicate IPC.
      const mtimeMs = dirtyWriteCheck.diskMtimeMs ?? (await detectTextFileMeta(tab.relativePath, repoCwd)).mtimeMs
      commitModelBaseline(repoCwd, tab.relativePath, content, snapshotVersionId ?? undefined, mtimeMs)
      set(state => ({
        tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isDirty: false, ...pinTabFields() } : t)),
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }))
      return true
    }

    const normalized = tab.relativePath.replace(/\\/g, '/')
    markPathSaving(repoCwd, normalized)
    try {
      const result = await window.api.system.write_file(tab.relativePath, content, { cwd: repoCwd })
      if (!result.success) {
        toast.error(result.error ?? i18n.t('editor.saveFailed'))
        return false
      }

      const meta = await detectTextFileMeta(tab.relativePath, repoCwd)
      commitModelBaseline(repoCwd, tab.relativePath, content, snapshotVersionId ?? undefined, meta.mtimeMs)
      set(state => ({
        tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isDirty: false, ...pinTabFields() } : t)),
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }))
      return true
    } finally {
      unmarkPathSaving(repoCwd, normalized)
    }
  },

  saveActiveTab: async () => {
    const { activeTabId, saveTab } = get()
    if (!activeTabId) return true
    return saveTab(activeTabId)
  },

  hasDirtyTabs: () => get().tabs.some(t => t.isDirty),

  reloadTabFromDisk: async (relativePath, preloadedContent, repoRootHint) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd: focusedRepoCwd, tabs } = get()
    const repoCwd = repoRootHint || focusedRepoCwd
    if (!repoCwd) return
    const tab = findTabForRepoPath(tabs, normalized, repoCwd)
    if (tab?.kind !== 'text') return
    const tabRoot = tabRepoRoot(tab, repoCwd)

    const { syncOpenFileFromDiskQuiet } = await import('@/pages/editor/lib/editorQuietDiskSync')
    const result = await syncOpenFileFromDiskQuiet(tabRoot, normalized, tab.languageId, preloadedContent)

    if (result === 'read-failed') {
      toast.error(i18n.t('editor.openFileFailed'))
      return
    }

    if (result === 'no-model' && tab.contentLoaded) {
      try {
        const content = preloadedContent ?? (await window.api.system.read_file(normalized, { cwd: tabRoot }))
        const baseline = content.replace(/\r\n/g, '\n')
        const meta = await detectTextFileMeta(normalized, tabRoot)
        const loadGeneration = registerModelBaseline(tabRoot, normalized, baseline, meta.mtimeMs)
        await syncTextModelFromDisk(tabRoot, normalized, baseline, tab.languageId, loadGeneration)
        const versionId = getModelAlternativeVersionId(tabRoot, normalized)
        commitModelBaseline(tabRoot, normalized, baseline, versionId ?? undefined, meta.mtimeMs)
        set(state => ({
          tabs: state.tabs.map(t => (t.id === tab.id ? { ...t, isDirty: false, contentLoaded: true, loadGeneration } : t)),
          tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
        }))
      } catch {
        toast.error(i18n.t('editor.openFileFailed'))
      }
      return
    }

    if (!tab.isDirty) return

    set(state => {
      const next = state.tabs.map(t => (t.id === tab.id ? { ...t, isDirty: false } : t))
      if (next.every((t, i) => t.isDirty === state.tabs[i]?.isDirty)) return state
      return { tabs: next, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  },

  syncTabFromDiskQuiet: async (relativePath, preloadedContent, repoRootHint) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd: focusedRepoCwd, tabs } = get()
    const repoCwd = repoRootHint || focusedRepoCwd
    if (!repoCwd) return
    const tab = findTabForRepoPath(tabs, normalized, repoCwd)
    if (tab?.kind !== 'text' || !tab.contentLoaded || tab.isDirty) return
    const tabRoot = tabRepoRoot(tab, repoCwd)

    const { syncOpenFileFromDiskQuiet } = await import('@/pages/editor/lib/editorQuietDiskSync')
    const result = await syncOpenFileFromDiskQuiet(tabRoot, normalized, tab.languageId, preloadedContent)

    if (result === 'no-model') {
      await get().reloadTabFromDisk(normalized, preloadedContent, tabRoot)
    }
  },

  reloadTabFromDiskIfChanged: async (relativePath, repoRootHint) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const repoCwd = repoRootHint || get().repoCwd
    const inflightKey = `${normalizeEditorRepoKey(repoCwd)}::${normalized}`
    const inflight = reloadIfChangedInflight.get(inflightKey)
    if (inflight) {
      await inflight
      return
    }

    const promise = (async () => {
      const { tabs } = get()
      if (!repoCwd) return
      const tab = findTabForRepoPath(tabs, normalized, repoCwd)
      if (tab?.kind !== 'text' || !tab.contentLoaded || tab.isDirty) return
      const tabRoot = tabRepoRoot(tab, repoCwd)

      const { checkDiskContentAgainstBuffer } = await import('@/pages/editor/lib/editorExternalFileSync')
      const { changed, diskText } = await checkDiskContentAgainstBuffer(tabRoot, normalized)
      if (!changed) return
      await get().syncTabFromDiskQuiet(normalized, diskText ?? undefined, tabRoot)
    })()

    reloadIfChangedInflight.set(inflightKey, promise)
    try {
      await promise
    } finally {
      reloadIfChangedInflight.delete(inflightKey)
    }
  },

  reconcileDirtyTabIfDiskMatchesBuffer: async (tabId, relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const tab = get().tabs.find(t => t.id === tabId)
    const repoCwd = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
    if (!repoCwd) return false

    const { checkDiskContentAgainstBuffer } = await import('@/pages/editor/lib/editorExternalFileSync')
    const { changed } = await checkDiskContentAgainstBuffer(repoCwd, normalized)
    if (changed) return false

    const content = getModelText(repoCwd, normalized) ?? getModelBaseline(repoCwd, normalized)
    const versionId = getModelAlternativeVersionId(repoCwd, normalized)
    const meta = await detectTextFileMeta(normalized, repoCwd)
    commitModelBaseline(repoCwd, normalized, content, versionId ?? undefined, meta.mtimeMs)
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isDirty: false } : t)),
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    return true
  },

  revertActiveTabFromDisk: async () => {
    const { activeTabId, tabs } = get()
    if (!activeTabId) return
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab?.kind !== 'text') return
    await get().reloadTabFromDisk(tab.relativePath)
  },

  markTabOutOfSyncWithDisk: (relativePath, repoRootHint) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    const tab = tabs.find(
      t =>
        t.kind === 'text' &&
        t.relativePath.replace(/\\/g, '/') === normalized &&
        (!repoRootHint || normalizeEditorRepoKey(tabRepoRoot(t, repoCwd)) === normalizeEditorRepoKey(repoRootHint))
    )
    if (!tab) return
    const tabRoot = tabRepoRoot(tab, repoCwd)
    if (!tabRoot) return

    const versionId = getModelAlternativeVersionId(tabRoot, normalized)
    forceBufferDirtyState(tabRoot, normalized, versionId)

    set(state => ({
      tabs: state.tabs.map(t => (t.id === tab.id ? { ...t, isDirty: true, ...(t.isPreview ? pinTabFields() : {}) } : t)),
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
  },

  prefetchTabContent: async tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    const tabRoot = tab ? tabRepoRoot(tab, get().repoCwd) : get().repoCwd
    if (!tab || tab.contentLoaded || tab.kind !== 'text' || !tabRoot) return false
    if (!isLikelyBinaryPath(tab.relativePath)) {
      const meta = await detectTextFileMeta(tab.relativePath, tabRoot)
      if (meta.size > LSP_LARGE_FILE_BYTES) return false
    }
    await loadTabContentForStore(get, set, tabId)
    return true
  },

  revertDirtyTabs: () => {
    const { tabs } = get()
    for (const tab of tabs) {
      if (!tab.isDirty || tab.kind !== 'text') continue
      const tabRoot = tabRepoRoot(tab, get().repoCwd)
      const baseline = getModelBaseline(tabRoot, tab.relativePath)
      void syncTextModelFromDisk(tabRoot, tab.relativePath, baseline, tab.languageId, tab.loadGeneration + 1)
    }
    set(state => ({
      tabs: state.tabs.map(t => (t.isDirty ? { ...t, isDirty: false } : t)),
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
  },

  renameExplorerPath: (from, to) => {
    const fromNorm = normalizeExplorerPath(from)
    const toNorm = normalizeExplorerPath(to)
    if (!fromNorm || fromNorm === toNorm) return

    const { repoCwd } = get()
    if (!repoCwd) return

    void import('monaco-editor').then(monaco => {
      renameModelInRegistry(repoCwd, fromNorm, toNorm, monaco)
    })

    set(state => {
      let activeTabId = state.activeTabId
      const nextTabs = state.tabs.map(tab => {
        const tabRoot = tabRepoRoot(tab, repoCwd)
        if (tab.kind === 'compare' && tab.compareWithPath) {
          const leftRemapped = remapPathForRename(tab.relativePath, fromNorm, toNorm)
          const rightRemapped = remapPathForRename(tab.compareWithPath, fromNorm, toNorm)
          if (!leftRemapped && !rightRemapped) return tab
          const nextLeft = leftRemapped ?? tab.relativePath
          const nextRight = rightRemapped ?? tab.compareWithPath
          const nextId = tabIdForCompare(tabRoot, nextLeft, nextRight)
          if (activeTabId === tab.id) activeTabId = nextId
          return {
            ...tab,
            id: nextId,
            relativePath: nextLeft,
            compareWithPath: nextRight,
            languageId: getEditorLanguage(nextLeft),
          }
        }
        const remapped = remapPathForRename(tab.relativePath, fromNorm, toNorm)
        if (!remapped) return tab
        renameModelPath(tabRoot, tab.relativePath, remapped)
        const nextId = tabIdForResource(tabRoot, remapped)
        if (activeTabId === tab.id) activeTabId = nextId
        return {
          ...tab,
          id: nextId,
          relativePath: remapped,
          languageId: getEditorLanguage(remapped),
        }
      })
      const nextState = { tabs: nextTabs, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
      persistWorkspaceSession({ ...state, ...nextState }, nextTabs, activeTabId)
      return nextState
    })
  },

  closeTabsForExplorerDelete: (relativePath, isDir) => {
    const target = normalizeExplorerPath(relativePath)
    const { repoCwd, tabs } = get()
    if (!repoCwd || !target) return

    removeClosedEditorTabsForPath(relativePath, repoCwd, isDir)

    const closing = tabs.filter(tab => {
      if (normalizeEditorRepoKey(tabRepoRoot(tab, repoCwd)) !== normalizeEditorRepoKey(repoCwd)) return false
      if (tab.kind === 'compare' && tab.compareWithPath) {
        const left = normalizeExplorerPath(tab.relativePath)
        const right = normalizeExplorerPath(tab.compareWithPath)
        if (isDir) {
          return left === target || left.startsWith(`${target}/`) || right === target || right.startsWith(`${target}/`)
        }
        return left === target || right === target
      }
      const path = normalizeExplorerPath(tab.relativePath)
      if (isDir) return path === target || path.startsWith(`${target}/`)
      return path === target
    })
    if (closing.length === 0) return

    for (const tab of closing) {
      const tabRoot = tabRepoRoot(tab, repoCwd)
      if (tab.kind === 'text') {
        disposeTextModel(tabRoot, tab.relativePath)
        unregisterModel(tabRoot, tab.relativePath)
      }
      clearViewStateForTab(tab.id)
    }

    set(state => {
      const closingIds = new Set(closing.map(t => t.id))
      const next = state.tabs.filter(t => !closingIds.has(t.id))
      let activeTabId = state.activeTabId
      if (activeTabId && closingIds.has(activeTabId)) {
        activeTabId = resolveNextActiveTabAfterClose(activeTabId, state.tabs, next)
        if (activeTabId) {
          recordEditorTabActivation(
            activeTabId,
            next.map(t => t.id)
          )
        }
      }
      for (const id of closingIds) {
        removeEditorTabFromActivation(id)
      }
      const active = next.find(t => t.id === activeTabId)
      const nextState = {
        tabs: next,
        activeTabId,
        repoCwd: active ? tabRepoRoot(active, state.repoCwd) : state.repoCwd,
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }
      persistWorkspaceSession({ ...state, ...nextState }, next, activeTabId)
      return nextState
    })
  },

  reopenLastClosedEditor: async () => {
    const lastClosedEditors = takeLastClosedEditorsBatch()
    if (lastClosedEditors.length === 0) return

    let anyReopened = false
    await runIgnoringClosedEditorRecording(async () => {
      for (const closed of lastClosedEditors) {
        const { tabs } = get()
        const alreadyOpen =
          closed.kind === 'compare' && closed.compareWithPath
            ? tabs.some(
                t =>
                  t.kind === 'compare' &&
                  t.relativePath.replace(/\\/g, '/') === closed.relativePath &&
                  t.compareWithPath?.replace(/\\/g, '/') === closed.compareWithPath &&
                  normalizeEditorRepoKey(tabRepoRoot(t, get().repoCwd)) === normalizeEditorRepoKey(closed.repoRoot)
              )
            : Boolean(findTabForRepoPath(tabs, closed.relativePath, closed.repoRoot))

        if (alreadyOpen) continue

        if (closed.kind === 'compare' && closed.compareWithPath) {
          const insertIndex = resolveReopenInsertIndex(get().tabs, closed.index, closed.sticky)
          await get().openCompare(closed.relativePath, closed.compareWithPath, {
            sticky: closed.sticky,
            insertIndex,
          })
        } else {
          const insertIndex = resolveReopenInsertIndex(get().tabs, closed.index, closed.sticky)
          await get().openFile(closed.relativePath, {
            pin: true,
            sticky: closed.sticky,
            insertIndex,
            repoRoot: closed.repoRoot,
            line: closed.reveal?.line,
            column: closed.reveal?.column,
          })
        }
        anyReopened = true
      }
    })

    if (!anyReopened && hasClosedEditorTabs()) {
      await get().reopenLastClosedEditor()
    }
  },
}))
