import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal, type FontWeight } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  attachCopyOnSelect,
  attachRightClickBehavior,
  attachTerminalShortcutHandler,
  type PasteConfirmHandler,
  type TerminalContextMenuActions,
} from '@/lib/terminal/terminalInput'
import { playTerminalBell } from '@/lib/terminal/terminalBell'
import { buildTerminalClearCommand } from '@/lib/terminal/terminalClear'
import {
  resolveTerminalFontFamily,
  resolveTerminalFontWeight,
  resolveTerminalCursorOptions,
  type TerminalPrefs,
} from '@/lib/terminal/terminalPrefs'
import { buildXtermThemeForPrefs } from '@/lib/terminal/xtermTheme'
import {
  INITIAL_SHELL_INTEGRATION_STATE,
  shellIntegrationBufferEvents,
  shellIntegrationInputEvents,
  type TerminalShellIntegrationState,
} from '@/lib/terminal/terminalShellIntegration'
import { TerminalShellIntegrationAddon } from '@/lib/terminal/terminalShellIntegrationAddon'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import type { TerminalShellProfileId } from 'shared/terminal/shells'

const RESIZE_DEBOUNCE_MS = 50
const SMOOTH_SCROLL_DURATION_MS = 125

export type IntegratedTerminalStatus = 'idle' | 'loading' | 'ready' | 'error' | 'exited'

type UseIntegratedTerminalOptions = {
  enabled: boolean
  visible: boolean
  focused: boolean
  panelVisible: boolean
  /** Stable tab id used for Pty Host persistence / re-attach. */
  terminalId: string
  shouldPersist?: boolean
  tryAttach?: boolean
  cwd?: string
  shellProfileId: TerminalShellProfileId
  prefs: TerminalPrefs
  onSpawnError?: (message: string) => void
  onContextMenu?: (event: MouseEvent, actions: TerminalContextMenuActions) => void
  confirmMultiLinePaste?: PasteConfirmHandler
  onShellIntegrationChange?: (state: TerminalShellIntegrationState) => void
}

function applyTerminalOptions(term: Terminal, prefs: TerminalPrefs) {
  term.options.theme = buildXtermThemeForPrefs(prefs.cursorColorMode, prefs.cursorColor, prefs.cursorStyle)
  term.options.fontSize = prefs.fontSize
  term.options.fontFamily = resolveTerminalFontFamily(prefs.fontFamilyId)
  term.options.fontWeight = resolveTerminalFontWeight(prefs.fontWeight) as FontWeight
  term.options.lineHeight = prefs.lineHeight
  term.options.cursorBlink = prefs.cursorBlink
  const cursor = resolveTerminalCursorOptions(prefs.cursorStyle)
  term.options.cursorStyle = cursor.xtermCursorStyle
  term.options.cursorWidth = cursor.cursorWidth
  term.options.altClickMovesCursor = prefs.altClickMovesCursor
  term.options.scrollOnUserInput = prefs.scrollOnUserInput
  term.options.smoothScrollDuration = prefs.smoothScrolling ? SMOOTH_SCROLL_DURATION_MS : 0
  term.options.fastScrollModifier = prefs.fastScrollModifier === 'none' ? undefined : prefs.fastScrollModifier
  term.options.fastScrollSensitivity = prefs.fastScrollSensitivity
}

export function useIntegratedTerminal({
  enabled,
  visible,
  focused,
  panelVisible,
  terminalId,
  shouldPersist = false,
  tryAttach = false,
  cwd,
  shellProfileId,
  prefs,
  onSpawnError,
  onContextMenu,
  confirmMultiLinePaste,
  onShellIntegrationChange,
}: UseIntegratedTerminalOptions) {
  const appAppearanceKey = useAppAppearanceThemeKey()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTokenRef = useRef(0)
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const onBellDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const detachShortcutsRef = useRef<(() => void) | null>(null)
  const detachCopyOnSelectRef = useRef<(() => void) | null>(null)
  const detachRightClickRef = useRef<(() => void) | null>(null)
  const prefsRef = useRef(prefs)
  const onContextMenuRef = useRef(onContextMenu)
  const confirmMultiLinePasteRef = useRef(confirmMultiLinePaste)
  const onShellIntegrationChangeRef = useRef(onShellIntegrationChange)
  const integrationStateRef = useRef<TerminalShellIntegrationState>(INITIAL_SHELL_INTEGRATION_STATE)
  const shellIntegrationAddonRef = useRef<TerminalShellIntegrationAddon | null>(null)
  const promptCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCursorMoveDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const panelVisibleRef = useRef(panelVisible)
  const focusedRef = useRef(focused)
  const visibleRef = useRef(visible)
  const hostIntersectingRef = useRef(true)
  const syncWebglRendererRef = useRef<(() => void) | null>(null)
  prefsRef.current = prefs
  onContextMenuRef.current = onContextMenu
  confirmMultiLinePasteRef.current = confirmMultiLinePaste
  onShellIntegrationChangeRef.current = onShellIntegrationChange
  panelVisibleRef.current = panelVisible
  focusedRef.current = focused
  visibleRef.current = visible

  const [status, setStatus] = useState<IntegratedTerminalStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const writeToPty = useCallback((data: string) => {
    const id = terminalIdRef.current
    if (!id) return
    window.api.terminal.write({ id, data })
  }, [])

  const fitAndResize = useCallback(() => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    const id = terminalIdRef.current
    if (!term || !fitAddon || !id) return

    fitAddon.fit()
    window.api.terminal.resize({
      id,
      cols: term.cols,
      rows: term.rows,
    })
  }, [])

  const scheduleFit = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = null
      fitAndResize()
    }, RESIZE_DEBOUNCE_MS)
  }, [fitAndResize])

  const isActiveTerminalSurface = useCallback(() => {
    return visibleRef.current && panelVisibleRef.current
  }, [])

  const shouldUseWebglRenderer = useCallback(() => {
    return prefsRef.current.enableWebGlRenderer && isActiveTerminalSurface() && hostIntersectingRef.current
  }, [isActiveTerminalSurface])

  const detachWebglRenderer = useCallback(() => {
    const addon = webglAddonRef.current
    if (!addon) return
    webglAddonRef.current = null
    try {
      addon.dispose()
    } catch {
      // dispose is best-effort
    }
  }, [])

  const attachWebglRenderer = useCallback((term: Terminal) => {
    if (webglAddonRef.current || !prefsRef.current.enableWebGlRenderer) return
    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        if (webglAddonRef.current === webglAddon) webglAddonRef.current = null
      })
      webglAddonRef.current = webglAddon
    } catch {
      webglAddonRef.current = null
    }
  }, [])

  const syncWebglRenderer = useCallback(() => {
    const term = termRef.current
    if (!term) return

    const wantWebGl = shouldUseWebglRenderer()

    if (wantWebGl) {
      if (!webglAddonRef.current) {
        attachWebglRenderer(term)
        term.refresh(0, Math.max(0, term.rows - 1))
        scheduleFit()
      }
      return
    }

    if (webglAddonRef.current) {
      detachWebglRenderer()
      term.refresh(0, Math.max(0, term.rows - 1))
    }
  }, [attachWebglRenderer, detachWebglRenderer, scheduleFit, shouldUseWebglRenderer])

  syncWebglRendererRef.current = syncWebglRenderer

  const refreshTerminalSurface = useCallback(() => {
    const term = termRef.current
    if (!term) return
    syncWebglRenderer()
    try {
      webglAddonRef.current?.clearTextureAtlas()
    } catch {
      // WebGL atlas clear is best-effort
    }
    term.refresh(0, Math.max(0, term.rows - 1))
    scheduleFit()
  }, [scheduleFit, syncWebglRenderer])

  const shouldPersistRef = useRef(shouldPersist)
  shouldPersistRef.current = shouldPersist

  const destroySession = useCallback(async () => {
    onDataDisposableRef.current?.dispose()
    onDataDisposableRef.current = null
    onBellDisposableRef.current?.dispose()
    onBellDisposableRef.current = null
    detachShortcutsRef.current?.()
    detachShortcutsRef.current = null
    detachCopyOnSelectRef.current?.()
    detachCopyOnSelectRef.current = null
    detachRightClickRef.current?.()
    detachRightClickRef.current = null

    const id = terminalIdRef.current
    terminalIdRef.current = null
    if (id) {
      try {
        if (shouldPersistRef.current) {
          await window.api.terminal.detach(id)
        } else {
          await window.api.terminal.destroy(id)
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }, [])

  const disposeTerminal = useCallback(() => {
    onDataDisposableRef.current?.dispose()
    onDataDisposableRef.current = null
    onBellDisposableRef.current?.dispose()
    onBellDisposableRef.current = null
    detachShortcutsRef.current?.()
    detachShortcutsRef.current = null
    detachCopyOnSelectRef.current?.()
    detachCopyOnSelectRef.current = null
    detachRightClickRef.current?.()
    detachRightClickRef.current = null

    const term = termRef.current
    termRef.current = null
    fitAddonRef.current = null
    shellIntegrationAddonRef.current?.dispose()
    shellIntegrationAddonRef.current = null
    onCursorMoveDisposableRef.current?.dispose()
    onCursorMoveDisposableRef.current = null
    if (promptCheckTimerRef.current) {
      clearTimeout(promptCheckTimerRef.current)
      promptCheckTimerRef.current = null
    }
    webglAddonRef.current?.dispose()
    webglAddonRef.current = null
    hostIntersectingRef.current = true
    if (term) {
      term.dispose()
    }
  }, [])

  const applyShellIntegrationInput = useCallback((data: string) => {
    const addon = shellIntegrationAddonRef.current
    if (!addon) return
    for (const event of shellIntegrationInputEvents(data, integrationStateRef.current.commandRunning)) {
      addon.applyInputEvent(event)
      integrationStateRef.current = addon.getState()
      onShellIntegrationChangeRef.current?.(integrationStateRef.current)
    }
  }, [])

  const applyShellIntegrationBufferCheck = useCallback(() => {
    const addon = shellIntegrationAddonRef.current
    const term = termRef.current
    if (!addon || !term || !integrationStateRef.current.commandRunning) return
    for (const event of shellIntegrationBufferEvents(term, shellProfileId, true)) {
      addon.applyInputEvent(event)
      integrationStateRef.current = addon.getState()
      onShellIntegrationChangeRef.current?.(integrationStateRef.current)
    }
  }, [shellProfileId])

  const scheduleShellIntegrationBufferCheck = useCallback(() => {
    if (promptCheckTimerRef.current) clearTimeout(promptCheckTimerRef.current)
    promptCheckTimerRef.current = setTimeout(() => {
      promptCheckTimerRef.current = null
      applyShellIntegrationBufferCheck()
    }, 80)
  }, [applyShellIntegrationBufferCheck])

  const applyShellIntegrationOutput = useCallback(() => {
    scheduleShellIntegrationBufferCheck()
  }, [scheduleShellIntegrationBufferCheck])

  const attachInputHandlers = useCallback((term: Terminal, container: HTMLElement) => {
    detachShortcutsRef.current?.()
    detachCopyOnSelectRef.current?.()
    detachRightClickRef.current?.()

    const currentPrefs = prefsRef.current
    const confirmMultiLine = currentPrefs.enableMultiLinePasteWarning
      ? (text: string) => confirmMultiLinePasteRef.current?.(text) ?? Promise.resolve(true)
      : undefined

    detachShortcutsRef.current = attachTerminalShortcutHandler(term, {
      copyShortcut: currentPrefs.copyShortcut,
      pasteShortcut: currentPrefs.pasteShortcut,
      write: writeToPty,
      confirmMultiLine,
    })
    detachCopyOnSelectRef.current = attachCopyOnSelect(container, term, currentPrefs.copyOnSelect)
    detachRightClickRef.current = attachRightClickBehavior(container, term, {
      behavior: currentPrefs.rightClickBehavior,
      write: writeToPty,
      confirmMultiLine,
      onContextMenu: (event, actions) => onContextMenuRef.current?.(event, actions),
    })
  }, [writeToPty])

  const restart = useCallback(() => {
    setSessionKey(prev => prev + 1)
  }, [])

  const clear = useCallback(() => {
    const id = terminalIdRef.current
    if (!id) return
    window.api.terminal.write({ id, data: buildTerminalClearCommand(shellProfileId) })
  }, [shellProfileId])

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setErrorMessage(null)
      void destroySession()
      disposeTerminal()
      return
    }

    const container = containerRef.current
    if (!container) return

    let disposed = false
    const token = ++restartTokenRef.current
    const currentPrefs = prefsRef.current

    const setup = async () => {
      setStatus('loading')
      setErrorMessage(null)

      integrationStateRef.current = INITIAL_SHELL_INTEGRATION_STATE
      onShellIntegrationChangeRef.current?.(INITIAL_SHELL_INTEGRATION_STATE)
      if (promptCheckTimerRef.current) {
        clearTimeout(promptCheckTimerRef.current)
        promptCheckTimerRef.current = null
      }

      await destroySession()
      disposeTerminal()

      const initialCursor = resolveTerminalCursorOptions(currentPrefs.cursorStyle)

      const term = new Terminal({
        scrollback: currentPrefs.scrollback,
        fontFamily: resolveTerminalFontFamily(currentPrefs.fontFamilyId),
        fontSize: currentPrefs.fontSize,
        fontWeight: resolveTerminalFontWeight(currentPrefs.fontWeight) as FontWeight,
        lineHeight: currentPrefs.lineHeight,
        cursorBlink: currentPrefs.cursorBlink,
        cursorStyle: initialCursor.xtermCursorStyle,
        cursorWidth: initialCursor.cursorWidth,
        altClickMovesCursor: currentPrefs.altClickMovesCursor,
        scrollOnUserInput: currentPrefs.scrollOnUserInput,
        smoothScrollDuration: currentPrefs.smoothScrolling ? SMOOTH_SCROLL_DURATION_MS : 0,
        convertEol: true,
        disableStdin: false,
        drawBoldTextInBrightColors: true,
        theme: buildXtermThemeForPrefs(
          currentPrefs.cursorColorMode,
          currentPrefs.cursorColor,
          currentPrefs.cursorStyle
        ),
      })

      const fitAddon = new FitAddon()
      if (currentPrefs.enableShellIntegration) {
        const shellIntegrationAddon = new TerminalShellIntegrationAddon(state => {
          integrationStateRef.current = state
          onShellIntegrationChangeRef.current?.(state)
        })
        shellIntegrationAddonRef.current = shellIntegrationAddon
        term.loadAddon(shellIntegrationAddon)
      } else {
        shellIntegrationAddonRef.current = null
      }
      term.loadAddon(fitAddon)

      term.open(container)
      fitAddon.fit()

      termRef.current = term
      fitAddonRef.current = fitAddon

      attachInputHandlers(term, container)

      if (currentPrefs.bellEnabled) {
        onBellDisposableRef.current = term.onBell(() => {
          if (prefsRef.current.bellEnabled) void playTerminalBell()
        })
      }

      const result = await window.api.terminal.create({
        id: terminalId,
        cwd,
        cols: term.cols,
        rows: term.rows,
        shellProfileId,
        shouldPersist,
        attach: tryAttach,
        shellIntegrationEnabled: currentPrefs.enableShellIntegration,
      })

      if (disposed || token !== restartTokenRef.current) {
        if (result.success) {
          if (shouldPersist) await window.api.terminal.detach(result.id)
          else await window.api.terminal.destroy(result.id)
        }
        term.dispose()
        return
      }

      if (!result.success) {
        setStatus('error')
        setErrorMessage(result.error)
        onSpawnError?.(result.error)
        term.dispose()
        termRef.current = null
        fitAddonRef.current = null
        return
      }

      terminalIdRef.current = result.id

      if (result.replay) {
        term.write(result.replay)
      }

      onDataDisposableRef.current = term.onData(data => {
        applyShellIntegrationInput(data)
        writeToPty(data)
      })

      onCursorMoveDisposableRef.current?.dispose()
      onCursorMoveDisposableRef.current = term.onCursorMove(() => {
        if (!integrationStateRef.current.commandRunning) return
        scheduleShellIntegrationBufferCheck()
      })

      setStatus('ready')
      if (focusedRef.current && isActiveTerminalSurface()) {
        term.focus()
      }
      syncWebglRenderer()
      scheduleFit()
    }

    void setup()

    const unsubscribeData = window.api.terminal.onData(({ id, data }) => {
      if (id !== terminalIdRef.current) return
      const term = termRef.current
      if (!term || !data) return
      term.write(data)
      applyShellIntegrationOutput()
    })

    const unsubscribeExit = window.api.terminal.onExit(({ id, exitCode }) => {
      if (id !== terminalIdRef.current) return
      setStatus('exited')
      termRef.current?.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
    })

    const intersectionObserver = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return
        const intersecting = entry.isIntersecting && entry.intersectionRatio > 0
        if (hostIntersectingRef.current === intersecting) return
        hostIntersectingRef.current = intersecting

        if (intersecting && visibleRef.current && panelVisibleRef.current) {
          const term = termRef.current
          if (term) {
            term.refresh(0, Math.max(0, term.rows - 1))
            scheduleFit()
          }
        }

        syncWebglRendererRef.current?.()
      },
      { threshold: [0, 0.01] }
    )
    intersectionObserver.observe(container)

    const resizeObserver = new ResizeObserver(() => {
      if (isActiveTerminalSurface()) scheduleFit()
    })
    resizeObserver.observe(container)

    const onWindowResize = () => {
      if (panelVisibleRef.current) scheduleFit()
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      disposed = true
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', onWindowResize)
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      unsubscribeData()
      unsubscribeExit()
      onCursorMoveDisposableRef.current?.dispose()
      onCursorMoveDisposableRef.current = null
      if (promptCheckTimerRef.current) {
        clearTimeout(promptCheckTimerRef.current)
        promptCheckTimerRef.current = null
      }
      void destroySession()
      disposeTerminal()
    }
  }, [
    enabled,
    cwd,
    shellProfileId,
    sessionKey,
    terminalId,
    shouldPersist,
    tryAttach,
    destroySession,
    disposeTerminal,
    onSpawnError,
    scheduleFit,
    attachInputHandlers,
    writeToPty,
    applyShellIntegrationInput,
    applyShellIntegrationOutput,
    scheduleShellIntegrationBufferCheck,
    isActiveTerminalSurface,
    syncWebglRenderer,
  ])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    applyTerminalOptions(term, prefs)
    term.refresh(0, term.rows - 1)
  }, [
    prefs.cursorColorMode,
    prefs.cursorColor,
    prefs.cursorStyle,
    prefs.cursorBlink,
    prefs.smoothScrolling,
    prefs.altClickMovesCursor,
    prefs.scrollOnUserInput,
    prefs.fontSize,
    prefs.fontFamilyId,
    prefs.fontWeight,
    prefs.lineHeight,
    prefs.scrollback,
    prefs.fastScrollModifier,
    prefs.fastScrollSensitivity,
    prefs,
  ])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const frame = requestAnimationFrame(() => {
      applyTerminalOptions(term, prefsRef.current)
      refreshTerminalSurface()
    })
    return () => cancelAnimationFrame(frame)
  }, [appAppearanceKey, refreshTerminalSurface])

  useEffect(() => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    const container = containerRef.current
    if (!term) return

    if (container) {
      attachInputHandlers(term, container)
    }

    if (fitAddon && panelVisible) {
      fitAddon.fit()
      const id = terminalIdRef.current
      if (id) {
        window.api.terminal.resize({ id, cols: term.cols, rows: term.rows })
      }
    }
  }, [
    prefs.copyOnSelect,
    prefs.rightClickBehavior,
    prefs.copyShortcut,
    prefs.pasteShortcut,
    prefs.enableMultiLinePasteWarning,
    attachInputHandlers,
    panelVisible,
  ])

  useEffect(() => {
    const term = termRef.current
    if (!term) return

    onBellDisposableRef.current?.dispose()
    onBellDisposableRef.current = null
    if (!prefs.bellEnabled) return

    onBellDisposableRef.current = term.onBell(() => {
      if (prefsRef.current.bellEnabled) void playTerminalBell()
    })

    return () => {
      onBellDisposableRef.current?.dispose()
      onBellDisposableRef.current = null
    }
  }, [prefs.bellEnabled])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.scrollback = prefs.scrollback
  }, [prefs.scrollback])

  useEffect(() => {
    if (!visible || !panelVisible || status !== 'ready') return
    refreshTerminalSurface()
  }, [visible, panelVisible, status, refreshTerminalSurface])

  useEffect(() => {
    if (status !== 'ready') return
    syncWebglRenderer()
  }, [visible, panelVisible, status, prefs.enableWebGlRenderer, syncWebglRenderer])

  useEffect(() => {
    if (!focused || !panelVisible || !visible || status !== 'ready') return
    termRef.current?.focus()
  }, [focused, visible, panelVisible, status])

  useEffect(() => {
    if (!panelVisible || status !== 'ready') return
    scheduleFit()
  }, [panelVisible, status, scheduleFit])

  const sendInterrupt = useCallback(() => {
    applyShellIntegrationInput('\x03')
    writeToPty('\x03')
  }, [applyShellIntegrationInput, writeToPty])

  const killAndRestart = useCallback(() => {
    restart()
  }, [restart])

  return {
    containerRef,
    status,
    errorMessage,
    restart,
    clear,
    sendInterrupt,
    killAndRestart,
    focus: () => termRef.current?.focus(),
    enableLigatures: prefs.enableLigatures,
  }
}
