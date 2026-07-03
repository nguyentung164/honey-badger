import { useCallback, useEffect, useRef, useState } from 'react'

const MAIN_TERMINAL_PANEL_KEY = 'main-terminal-panel-config'
const DEFAULT_TERMINAL_PANEL_SIZE = 30
const MIN_TERMINAL_PANEL_SIZE = 15
const MAX_TERMINAL_PANEL_SIZE = 60

const MAIN_SHELL_CONTENT_PANEL_ID = 'main-shell-content'
const INTEGRATED_TERMINAL_PANEL_ID = 'integrated-terminal'

type TerminalPanelConfig = {
  open: boolean
  sizePercent: number
}

function readTerminalPanelConfig(): TerminalPanelConfig {
  try {
    const raw = localStorage.getItem(MAIN_TERMINAL_PANEL_KEY)
    if (!raw) {
      return { open: false, sizePercent: DEFAULT_TERMINAL_PANEL_SIZE }
    }
    const parsed = JSON.parse(raw) as Partial<TerminalPanelConfig>
    const sizePercent =
      typeof parsed.sizePercent === 'number'
        ? Math.max(MIN_TERMINAL_PANEL_SIZE, Math.min(MAX_TERMINAL_PANEL_SIZE, parsed.sizePercent))
        : DEFAULT_TERMINAL_PANEL_SIZE
    return {
      open: Boolean(parsed.open),
      sizePercent,
    }
  } catch {
    return { open: false, sizePercent: DEFAULT_TERMINAL_PANEL_SIZE }
  }
}

function writeTerminalPanelConfig(config: TerminalPanelConfig): void {
  try {
    localStorage.setItem(MAIN_TERMINAL_PANEL_KEY, JSON.stringify(config))
  } catch {
    // ignore quota errors
  }
}

export function useMainTerminalPanel() {
  const initialConfigRef = useRef(readTerminalPanelConfig())
  const [terminalOpen, setTerminalOpen] = useState(initialConfigRef.current.open)
  const [terminalPanelSize, setTerminalPanelSize] = useState(initialConfigRef.current.sizePercent)
  const terminalPanelGroupRef = useRef<any>(null)
  const isApplyingTerminalLayoutRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyTerminalLayout = useCallback((open: boolean, size: number) => {
    const group = terminalPanelGroupRef.current
    if (!group?.setLayout) return
    isApplyingTerminalLayoutRef.current = true
    group.setLayout({
      [MAIN_SHELL_CONTENT_PANEL_ID]: open ? 100 - size : 100,
      [INTEGRATED_TERMINAL_PANEL_ID]: open ? size : 0,
    })
    queueMicrotask(() => {
      isApplyingTerminalLayoutRef.current = false
    })
  }, [])

  const persistTerminalConfig = useCallback((open: boolean, size: number) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      writeTerminalPanelConfig({ open, sizePercent: size })
    }, 200)
  }, [])

  const openTerminal = useCallback(() => {
    setTerminalOpen(true)
    applyTerminalLayout(true, terminalPanelSize)
    persistTerminalConfig(true, terminalPanelSize)
  }, [applyTerminalLayout, persistTerminalConfig, terminalPanelSize])

  const closeTerminal = useCallback(() => {
    setTerminalOpen(false)
    applyTerminalLayout(false, terminalPanelSize)
    persistTerminalConfig(false, terminalPanelSize)
  }, [applyTerminalLayout, persistTerminalConfig, terminalPanelSize])

  const toggleTerminal = useCallback(() => {
    if (terminalOpen) {
      closeTerminal()
    } else {
      openTerminal()
    }
  }, [terminalOpen, closeTerminal, openTerminal])

  const handleTerminalLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      if (isApplyingTerminalLayoutRef.current) return
      const terminalSize = layout[INTEGRATED_TERMINAL_PANEL_ID]
      if (typeof terminalSize !== 'number') return
      if (terminalSize <= 0) {
        if (terminalOpen) {
          setTerminalOpen(false)
          persistTerminalConfig(false, terminalPanelSize)
        }
        return
      }
      const clamped = Math.max(MIN_TERMINAL_PANEL_SIZE, Math.min(MAX_TERMINAL_PANEL_SIZE, terminalSize))
      setTerminalPanelSize(clamped)
      if (!terminalOpen) setTerminalOpen(true)
      persistTerminalConfig(true, clamped)
    },
    [persistTerminalConfig, terminalOpen, terminalPanelSize]
  )

  useEffect(() => {
    const { open, sizePercent } = initialConfigRef.current
    if (!open) return
    const timer = setTimeout(() => {
      applyTerminalLayout(true, sizePercent)
    }, 0)
    return () => clearTimeout(timer)
  }, [applyTerminalLayout])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [])

  return {
    terminalOpen,
    terminalPanelSize,
    terminalPanelGroupRef,
    toggleTerminal,
    openTerminal,
    closeTerminal,
    handleTerminalLayoutChanged,
    mainShellContentPanelId: MAIN_SHELL_CONTENT_PANEL_ID,
    integratedTerminalPanelId: INTEGRATED_TERMINAL_PANEL_ID,
    minTerminalPanelSize: MIN_TERMINAL_PANEL_SIZE,
    maxTerminalPanelSize: MAX_TERMINAL_PANEL_SIZE,
  }
}
