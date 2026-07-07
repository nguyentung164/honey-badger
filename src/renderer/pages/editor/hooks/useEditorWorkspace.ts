import { create } from 'zustand'
import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'
import { getEditorLanguage } from '@/lib/monacoLanguage'
import { useEditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { editorCommandBridge } from '@/pages/editor/lib/editorCommandBridge'
import { EDITOR_OPEN_FILE_MAX_BYTES, LSP_LARGE_FILE_BYTES } from 'shared/fileUri'
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
import { editorLanguageService } from '@/pages/editor/lsp/EditorLanguageService'
import {
  commitModelBaseline,
  forceBufferDirtyState,
  getModelBaseline,
  isDirtyByVersion,
  registerModelBaseline,
  renameModelPath,
  unregisterModel,
} from '@/pages/editor/lib/editorTextModels'
import {
  flushPersistedSession,
  normalizeEditorRepoKey,
  readPersistedSession,
  schedulePersistedSession,
} from '@/pages/editor/lib/editorSessionPersist'
import {
  type EditorTab,
  type OpenFileOptions,
  MAX_EDITOR_TABS,
  tabIdForCompare,
} from '@/pages/editor/lib/editorWorkspaceTypes'
import {
  recordEditorTabActivation,
  removeEditorTabFromActivation,
  resolveNextActiveTabAfterClose,
  seedEditorTabActivation,
} from '@/pages/editor/lib/editorTabActivation'
import { markPathSaving, unmarkPathSaving } from '@/pages/editor/lib/editorSavingPaths'

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'zip', 'gz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'pdf',
])

type EditorWorkspaceState = {
  repoCwd: string
  tabs: EditorTab[]
  activeTabId: string | null
  tabsMetaRevision: number
  setRepoCwd: (cwd: string) => void
  openFile: (relativePath: string, opts?: OpenFileOptions) => Promise<void>
  consumeTabReveal: (tabId: string) => void
  openCompare: (leftPath: string, rightPath: string) => Promise<void>
  openCompareSnapshots: (leftPath: string, rightPath: string, leftContent: string, rightContent: string) => Promise<void>
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  pinTab: (tabId: string) => void
  syncTabDirty: (tabId: string, alternativeVersionId: number) => void
  saveTabViewState: (tabId: string, viewStateJson: string) => void
  saveTab: (tabId: string) => Promise<boolean>
  saveActiveTab: () => Promise<boolean>
  hasDirtyTabs: () => boolean
  reloadTabFromDisk: (relativePath: string, preloadedContent?: string) => Promise<void>
  syncTabFromDiskQuiet: (relativePath: string, preloadedContent?: string) => Promise<void>
  reloadTabFromDiskIfChanged: (relativePath: string) => Promise<void>
  reconcileDirtyTabIfDiskMatchesBuffer: (tabId: string, relativePath: string) => Promise<boolean>
  revertActiveTabFromDisk: () => Promise<void>
  markTabOutOfSyncWithDisk: (relativePath: string) => void
  prefetchTabContent: (tabId: string) => Promise<boolean>
  revertDirtyTabs: () => void
  renameExplorerPath: (from: string, to: string) => void
  closeTabsForExplorerDelete: (relativePath: string, isDir: boolean) => void
  resetForRepo: (cwd: string) => void
}

function tabIdForPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

function isLikelyBinaryPath(relativePath: string): boolean {
  const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTENSIONS.has(ext)
}

async function detectTextFileMeta(
  relativePath: string,
  repoCwd: string
): Promise<{ size: number; mtimeMs: number | null; kind: 'text' | 'image' | 'binary' }> {
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

function remapPathForRename(path: string, from: string, to: string): string | null {
  const normalized = normalizeExplorerPath(path)
  const fromNorm = normalizeExplorerPath(from)
  const toNorm = normalizeExplorerPath(to)
  if (normalized === fromNorm) return toNorm
  if (normalized.startsWith(`${fromNorm}/`)) return `${toNorm}${normalized.slice(fromNorm.length)}`
  return null
}

function createStubTab(relativePath: string): EditorTab {
  return {
    id: tabIdForPath(relativePath),
    relativePath,
    languageId: 'plaintext',
    isDirty: false,
    isLoading: false,
    contentLoaded: false,
    isPreview: false,
    isPinned: true,
    kind: 'text',
    version: 1,
    loadGeneration: 0,
  }
}

function pinTabFields(): Pick<EditorTab, 'isPreview' | 'isPinned'> {
  return { isPreview: false, isPinned: true }
}

async function syncTextModelFromDisk(
  repoCwd: string,
  relativePath: string,
  baseline: string,
  languageId: string,
  loadGeneration: number
): Promise<void> {
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
  const { repoCwd, tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
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
    const content =
      cachedModelText ?? (await window.api.system.read_file(tab.relativePath, { cwd: repoCwd }))
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
      const active = state.tabs.find(t => t.id === state.activeTabId)
      schedulePersistedSession(repoCwd, nextTabs, active?.relativePath ?? null)
      return { tabs: nextTabs, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  } catch {
    toast.error(i18n.t('editor.openFileFailed'))
    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive ? resolveNextActiveTabAfterClose(tabId, state.tabs, next) : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(activeTabId, next.map(t => t.id))
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
  const { repoCwd, tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
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
        recordEditorTabActivation(activeTabId, next.map(t => t.id))
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
  const { repoCwd, tabs } = get()
  const tab = tabs.find(t => t.id === tabId)
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
        recordEditorTabActivation(activeTabId, next.map(t => t.id))
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  }
}

export const useEditorWorkspace = create<EditorWorkspaceState>((set, get) => ({
  repoCwd: '',
  tabs: [],
  activeTabId: null,
  tabsMetaRevision: 0,

  setRepoCwd: cwd => {
    const prev = get().repoCwd
    if (prev === cwd || (prev && cwd && normalizeEditorRepoKey(prev) === normalizeEditorRepoKey(cwd))) return
    if (prev) {
      const active = get().tabs.find(t => t.id === get().activeTabId)
      flushPersistedSession(prev, get().tabs, active?.relativePath ?? null)
      editorLanguageService.closeAllDocuments()
    }
    get().resetForRepo(cwd)
  },

  resetForRepo: cwd => {
    const restoreTabs = useEditorSettings.getState().restoreEditorTabs
    const { paths, activePath } = readPersistedSession(cwd, restoreTabs)
    const limited = paths.slice(0, MAX_EDITOR_TABS)
    const active = activePath && limited.includes(activePath) ? activePath : limited[0] ?? null
    const stubs = limited.map(p => createStubTab(p))

    set(state => ({
      repoCwd: cwd,
      tabs: stubs,
      activeTabId: active ? tabIdForPath(active) : null,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))

    seedEditorTabActivation(
      stubs.map(s => s.id),
      active ? tabIdForPath(active) : null
    )

    if (active) {
      void loadTabContentForStore(get, set, tabIdForPath(active))
    }
  },

  openFile: async (relativePath, opts) => {
    const normalized = relativePath.replace(/\\/g, '/')
    let { repoCwd, tabs } = get()
    if (!repoCwd) return

    const pin = opts?.pin === true || opts?.preview === false
    const preview = opts?.preview === true && !pin

    const existing = tabs.find(t => t.relativePath === normalized)
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
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
        tabs: nextTabs,
      }))
      recordEditorTabActivation(existing.id, nextTabs.map(t => t.id))
      schedulePersistedSession(repoCwd, get().tabs, normalized)
      if (!existing.contentLoaded) {
        await loadTabContentForStore(get, set, existing.id, opts)
      }
      return
    }

    const previewSlot = preview ? tabs.find(t => t.isPreview && !t.isPinned && !t.isDirty) : null
    if (previewSlot) {
      removeEditorTabFromActivation(previewSlot.id)
      tabs = tabs.filter(t => t.id !== previewSlot.id)
    } else if (tabs.length >= MAX_EDITOR_TABS) {
      toast.error(i18n.t('editor.maxTabsReached', { count: MAX_EDITOR_TABS }))
      return
    }

    if (!opts?.forceLarge && !isLikelyBinaryPath(normalized)) {
      const meta = await detectTextFileMeta(normalized, repoCwd)
      if (meta.size > EDITOR_OPEN_FILE_MAX_BYTES) {
        emitLargeFileBlocked(normalized, meta.size, opts)
        return
      }
    }

    const id = tabIdForPath(normalized)
    const placeholder: EditorTab = {
      id,
      relativePath: normalized,
      languageId: 'plaintext',
      isDirty: false,
      isLoading: false,
      contentLoaded: false,
      isPreview: preview,
      isPinned: !preview,
      kind: 'text',
      version: 1,
      loadGeneration: 0,
      reveal: opts?.line ? { line: opts.line, column: opts.column ?? 1 } : undefined,
    }

    set(state => ({
      tabs: [...tabs, placeholder],
      activeTabId: id,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(id, [...tabs, placeholder].map(t => t.id))
    schedulePersistedSession(repoCwd, [...tabs, placeholder], normalized)
    await loadTabContentForStore(get, set, id, opts)
  },

  consumeTabReveal: tabId => {
    set(state => ({
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, reveal: undefined } : t)),
    }))
  },

  openCompare: async (leftPath, rightPath) => {
    const left = leftPath.replace(/\\/g, '/')
    const right = rightPath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd || left === right) return

    const id = tabIdForCompare(left, right)
    const existing = tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: existing.id })
      recordEditorTabActivation(existing.id, get().tabs.map(t => t.id))
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
      compareWithPath: right,
      languageId: getEditorLanguage(left),
      isDirty: false,
      isLoading: true,
      contentLoaded: false,
      isPreview: false,
      isPinned: true,
      kind: 'compare',
      version: 1,
      loadGeneration: 0,
    }

    set(state => ({
      tabs: [...tabs, placeholder],
      activeTabId: id,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(id, [...get().tabs].map(t => t.id))
    await loadCompareTabContent(get, set, id)
  },

  openCompareSnapshots: async (leftPath, rightPath, leftContent, rightContent) => {
    const left = leftPath.replace(/\\/g, '/')
    const right = rightPath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd || left === right) return

    const id = tabIdForCompare(left, right)
    const existing = tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: existing.id })
      recordEditorTabActivation(existing.id, get().tabs.map(t => t.id))
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
      compareWithPath: right,
      languageId: getEditorLanguage(left),
      isDirty: false,
      isLoading: true,
      contentLoaded: false,
      isPreview: false,
      isPinned: true,
      kind: 'compare',
      version: 1,
      loadGeneration: 0,
    }

    set(state => ({
      tabs: [...tabs, placeholder],
      activeTabId: id,
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    recordEditorTabActivation(id, [...get().tabs].map(t => t.id))
    await loadCompareTabContentFromMemory(get, set, id, leftContent, rightContent)
  },

  closeTab: tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    const repoCwd = get().repoCwd
    if (tab && repoCwd && tab.kind === 'compare') {
      void import('monaco-editor').then(monaco => disposeCompareModels(repoCwd, tab.id, monaco))
    }
    clearViewStateForTab(tabId)

    set(state => {
      const next = state.tabs.filter(t => t.id !== tabId)
      const wasActive = state.activeTabId === tabId
      const activeTabId = wasActive
        ? resolveNextActiveTabAfterClose(tabId, state.tabs, next)
        : state.activeTabId
      if (wasActive && activeTabId) {
        recordEditorTabActivation(activeTabId, next.map(t => t.id))
      } else if (!wasActive) {
        removeEditorTabFromActivation(tabId)
      }
      const active = next.find(t => t.id === activeTabId)
      schedulePersistedSession(state.repoCwd, next, active?.relativePath ?? null)
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  },

  setActiveTab: tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    set(state => (state.activeTabId === tabId ? state : { activeTabId: tabId }))
    if (tab) {
      recordEditorTabActivation(tabId, get().tabs.map(t => t.id))
      schedulePersistedSession(get().repoCwd, get().tabs, tab.relativePath)
      if (!tab.contentLoaded) {
        if (tab.kind === 'compare') void loadCompareTabContent(get, set, tabId)
        else void loadTabContentForStore(get, set, tabId)
      }
    }
  },

  pinTab: tabId => {
    set(state => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, ...pinTabFields() } : t)),
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
    schedulePersistedSession(get().repoCwd, get().tabs, get().tabs.find(t => t.id === tabId)?.relativePath ?? null)
  },

  saveTabViewState: (tabId, viewStateJson) => {
    set(state => ({
      tabs: state.tabs.map(t => {
        if (t.id !== tabId) return t
        if (t.viewStateJson === viewStateJson) return t
        return { ...t, viewStateJson }
      }),
    }))
  },

  syncTabDirty: (tabId, alternativeVersionId) => {
    const { repoCwd } = get()
    if (!repoCwd) return
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab || tab.kind !== 'text') return
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
    const { repoCwd, activeTabId } = get()
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab || tab.kind !== 'text' || !repoCwd) return true

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

    const { checkDirtyWriteOnSave } = await import('@/pages/editor/lib/editorDirtyWrite')
    const dirtyWriteCheck = await checkDirtyWriteOnSave(repoCwd, tab.relativePath, content)

    if (dirtyWriteCheck.action === 'noop') {
      const versionId = getModelAlternativeVersionId(repoCwd, tab.relativePath)
      const meta = await detectTextFileMeta(tab.relativePath, repoCwd)
      commitModelBaseline(repoCwd, tab.relativePath, content, versionId ?? undefined, meta.mtimeMs)
      set(state => ({
        tabs: state.tabs.map(t => (t.id === tabId ? { ...t, isDirty: false, ...pinTabFields() } : t)),
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }))
      return true
    }

    if (dirtyWriteCheck.action === 'confirm') {
      const { requestDirtyWriteChoice } = await import('@/pages/editor/lib/editorDirtyWritePrompt')
      const fileName = tab.relativePath.split('/').pop() ?? tab.relativePath
      const choice = await requestDirtyWriteChoice({
        relativePath: tab.relativePath,
        fileName,
        diskContent: dirtyWriteCheck.diskContent,
        editorContent: dirtyWriteCheck.editorContent,
      })
      if (choice === 'cancel') return false
      if (choice === 'revert') {
        await get().reloadTabFromDisk(tab.relativePath)
        return false
      }
      if (choice === 'compare') {
        const diskLabel = `${tab.relativePath} (disk)`
        const editorLabel = `${tab.relativePath} (editor)`
        await get().openCompareSnapshots(diskLabel, editorLabel, dirtyWriteCheck.diskContent, dirtyWriteCheck.editorContent)
        return false
      }
    }

    const normalized = tab.relativePath.replace(/\\/g, '/')
    markPathSaving(normalized)
    try {
      const result = await window.api.system.write_file(tab.relativePath, content, { cwd: repoCwd })
      if (!result.success) {
        toast.error(result.error ?? i18n.t('editor.saveFailed'))
        return false
      }

      const versionId = getModelAlternativeVersionId(repoCwd, tab.relativePath)
      const meta = await detectTextFileMeta(tab.relativePath, repoCwd)
      commitModelBaseline(repoCwd, tab.relativePath, content, versionId ?? undefined, meta.mtimeMs)
      set(state => ({
        tabs: state.tabs.map(t =>
          t.id === tabId ? { ...t, isDirty: false, ...pinTabFields() } : t
        ),
        tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
      }))
      return true
    } finally {
      unmarkPathSaving(normalized)
    }
  },

  saveActiveTab: async () => {
    const { activeTabId, saveTab } = get()
    if (!activeTabId) return true
    return saveTab(activeTabId)
  },

  hasDirtyTabs: () => get().tabs.some(t => t.isDirty),

  reloadTabFromDisk: async (relativePath, preloadedContent) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd) return
    const tab = tabs.find(t => t.relativePath.replace(/\\/g, '/') === normalized)
    if (!tab || tab.kind !== 'text') return

    const { syncOpenFileFromDiskQuiet } = await import('@/pages/editor/lib/editorQuietDiskSync')
    const result = await syncOpenFileFromDiskQuiet(repoCwd, normalized, tab.languageId, preloadedContent)

    if (result === 'read-failed') {
      toast.error(i18n.t('editor.openFileFailed'))
      return
    }

    if (result === 'no-model' && tab.contentLoaded) {
      try {
        const content = preloadedContent ?? (await window.api.system.read_file(normalized, { cwd: repoCwd }))
        const baseline = content.replace(/\r\n/g, '\n')
        const meta = await detectTextFileMeta(normalized, repoCwd)
        const loadGeneration = registerModelBaseline(repoCwd, normalized, baseline, meta.mtimeMs)
        await syncTextModelFromDisk(repoCwd, normalized, baseline, tab.languageId, loadGeneration)
        const versionId = getModelAlternativeVersionId(repoCwd, normalized)
        commitModelBaseline(repoCwd, normalized, baseline, versionId ?? undefined, meta.mtimeMs)
        set(state => ({
          tabs: state.tabs.map(t =>
            t.id === tab.id ? { ...t, isDirty: false, contentLoaded: true, loadGeneration } : t
          ),
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

  syncTabFromDiskQuiet: async (relativePath, preloadedContent) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd) return
    const tab = tabs.find(t => t.relativePath.replace(/\\/g, '/') === normalized)
    if (!tab || tab.kind !== 'text' || !tab.contentLoaded || tab.isDirty) return

    const { syncOpenFileFromDiskQuiet } = await import('@/pages/editor/lib/editorQuietDiskSync')
    const result = await syncOpenFileFromDiskQuiet(repoCwd, normalized, tab.languageId, preloadedContent)

    if (result === 'no-model') {
      await get().reloadTabFromDisk(normalized, preloadedContent)
    }
  },

  reloadTabFromDiskIfChanged: async relativePath => {
    const normalized = relativePath.replace(/\\/g, '/')
    const inflight = reloadIfChangedInflight.get(normalized)
    if (inflight) {
      await inflight
      return
    }

    const promise = (async () => {
      const { repoCwd, tabs } = get()
      if (!repoCwd) return
      const tab = tabs.find(t => t.relativePath.replace(/\\/g, '/') === normalized)
      if (!tab || tab.kind !== 'text' || !tab.contentLoaded || tab.isDirty) return

      const { checkDiskContentAgainstBuffer } = await import('@/pages/editor/lib/editorExternalFileSync')
      const { changed, diskText } = await checkDiskContentAgainstBuffer(repoCwd, normalized)
      if (!changed) return
      await get().syncTabFromDiskQuiet(normalized, diskText ?? undefined)
    })()

    reloadIfChangedInflight.set(normalized, promise)
    try {
      await promise
    } finally {
      reloadIfChangedInflight.delete(normalized)
    }
  },

  reconcileDirtyTabIfDiskMatchesBuffer: async (tabId, relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd } = get()
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
    if (!tab || tab.kind !== 'text') return
    await get().reloadTabFromDisk(tab.relativePath)
  },

  markTabOutOfSyncWithDisk: relativePath => {
    const normalized = relativePath.replace(/\\/g, '/')
    const { repoCwd, tabs } = get()
    if (!repoCwd) return
    const tab = tabs.find(t => t.kind === 'text' && t.relativePath.replace(/\\/g, '/') === normalized)
    if (!tab) return

    const versionId = getModelAlternativeVersionId(repoCwd, normalized)
    forceBufferDirtyState(repoCwd, normalized, versionId)

    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === tab.id ? { ...t, isDirty: true, ...(t.isPreview ? pinTabFields() : {}) } : t
      ),
      tabsMetaRevision: bumpMeta(state.tabsMetaRevision),
    }))
  },

  prefetchTabContent: async tabId => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab || tab.contentLoaded || tab.kind !== 'text' || !get().repoCwd) return false
    if (!isLikelyBinaryPath(tab.relativePath)) {
      const meta = await detectTextFileMeta(tab.relativePath, get().repoCwd)
      if (meta.size > LSP_LARGE_FILE_BYTES) return false
    }
    await loadTabContentForStore(get, set, tabId)
    return true
  },

  revertDirtyTabs: () => {
    const { repoCwd, tabs } = get()
    if (!repoCwd) return
    for (const tab of tabs) {
      if (!tab.isDirty || tab.kind !== 'text') continue
      const baseline = getModelBaseline(repoCwd, tab.relativePath)
      void syncTextModelFromDisk(repoCwd, tab.relativePath, baseline, tab.languageId, tab.loadGeneration + 1)
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
        if (tab.kind === 'compare' && tab.compareWithPath) {
          const leftRemapped = remapPathForRename(tab.relativePath, fromNorm, toNorm)
          const rightRemapped = remapPathForRename(tab.compareWithPath, fromNorm, toNorm)
          if (!leftRemapped && !rightRemapped) return tab
          const nextLeft = leftRemapped ?? tab.relativePath
          const nextRight = rightRemapped ?? tab.compareWithPath
          const nextId = tabIdForCompare(nextLeft, nextRight)
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
        renameModelPath(repoCwd, tab.relativePath, remapped)
        const nextId = tabIdForPath(remapped)
        if (activeTabId === tab.id) activeTabId = nextId
        return {
          ...tab,
          id: nextId,
          relativePath: remapped,
          languageId: getEditorLanguage(remapped),
        }
      })
      const active = nextTabs.find(t => t.id === activeTabId)
      schedulePersistedSession(repoCwd, nextTabs, active?.relativePath ?? null)
      return { tabs: nextTabs, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  },

  closeTabsForExplorerDelete: (relativePath, isDir) => {
    const target = normalizeExplorerPath(relativePath)
    const { repoCwd, tabs } = get()
    if (!repoCwd || !target) return

    const closing = tabs.filter(tab => {
      if (tab.kind === 'compare' && tab.compareWithPath) {
        const left = normalizeExplorerPath(tab.relativePath)
        const right = normalizeExplorerPath(tab.compareWithPath)
        if (isDir) {
          return (
            left === target ||
            left.startsWith(`${target}/`) ||
            right === target ||
            right.startsWith(`${target}/`)
          )
        }
        return left === target || right === target
      }
      const path = normalizeExplorerPath(tab.relativePath)
      if (isDir) return path === target || path.startsWith(`${target}/`)
      return path === target
    })
    if (closing.length === 0) return

    for (const tab of closing) {
      if (tab.kind === 'text') {
        disposeTextModel(repoCwd, tab.relativePath)
        unregisterModel(repoCwd, tab.relativePath)
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
          recordEditorTabActivation(activeTabId, next.map(t => t.id))
        }
      }
      for (const id of closingIds) {
        removeEditorTabFromActivation(id)
      }
      const active = next.find(t => t.id === activeTabId)
      schedulePersistedSession(state.repoCwd, next, active?.relativePath ?? null)
      return { tabs: next, activeTabId, tabsMetaRevision: bumpMeta(state.tabsMetaRevision) }
    })
  },
}))
