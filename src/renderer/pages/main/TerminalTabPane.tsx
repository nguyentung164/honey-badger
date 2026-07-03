import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { GlowLoader } from '@/components/ui-elements/GlowLoader'
import { useIntegratedTerminal } from '@/hooks/useIntegratedTerminal'
import type { PasteConfirmHandler } from '@/lib/terminal/terminalInput'
import type { TerminalShellIntegrationState } from '@/lib/terminal/terminalShellIntegration'
import { cn } from '@/lib/utils'
import type { TerminalPrefs } from '@/lib/terminal/terminalPrefs'
import { TerminalContextMenu, type TerminalContextMenuState } from '@/pages/main/TerminalContextMenu'
import type { TerminalShellProfileId } from 'shared/terminal/shells'

type TerminalTabPaneProps = {
  visible: boolean
  focused: boolean
  panelVisible: boolean
  cwd?: string
  shellProfileId: TerminalShellProfileId
  prefs: TerminalPrefs
  restartNonce?: number
  clearNonce?: number
  interruptNonce?: number
  confirmMultiLinePaste?: PasteConfirmHandler
  onShellIntegrationChange?: (state: TerminalShellIntegrationState) => void
}

export function TerminalTabPane({
  visible,
  focused,
  panelVisible,
  cwd,
  shellProfileId,
  prefs,
  restartNonce = 0,
  clearNonce = 0,
  interruptNonce = 0,
  confirmMultiLinePaste,
  onShellIntegrationChange,
}: TerminalTabPaneProps) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState | null>(null)

  const handleContextMenu = useCallback((event: MouseEvent, actions: TerminalContextMenuState['actions']) => {
    setContextMenu({ x: event.clientX, y: event.clientY, actions })
  }, [])

  const { containerRef, status, errorMessage, restart, clear, sendInterrupt, focus, enableLigatures } =
    useIntegratedTerminal({
      enabled: true,
      visible,
      focused: focused && visible,
      panelVisible,
      cwd,
      shellProfileId,
      prefs,
      onContextMenu: handleContextMenu,
      confirmMultiLinePaste,
      onShellIntegrationChange,
    })

  useEffect(() => {
    if (focused && panelVisible && visible) focus()
  }, [focused, panelVisible, visible, focus, status])

  useEffect(() => {
    if (restartNonce > 0) restart()
  }, [restartNonce, restart])

  useEffect(() => {
    if (clearNonce > 0) clear()
  }, [clearNonce, clear])

  useEffect(() => {
    if (interruptNonce > 0) sendInterrupt()
  }, [interruptNonce, sendInterrupt])

  return (
    <div
      className={cn(
        'integrated-terminal-host absolute inset-0 overflow-hidden',
        enableLigatures ? 'integrated-terminal-host--ligatures' : 'integrated-terminal-host--no-ligatures',
        visible ? 'z-10' : 'z-0 hidden'
      )}
      aria-hidden={!visible}
    >
      {status === 'loading' && visible ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
          <GlowLoader className="h-8 w-8" />
        </div>
      ) : null}

      {status === 'error' && visible ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-destructive">{errorMessage || t('terminal.spawnError')}</p>
          <Button type="button" size="sm" variant="outline" onClick={restart}>
            {t('terminal.restart')}
          </Button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn('h-full w-full font-mono text-sm', status === 'exited' && visible && 'opacity-90')}
          onMouseDown={() => {
            if (visible) focus()
          }}
        />
      )}

      <TerminalContextMenu
        menu={contextMenu}
        labels={{
          copy: t('terminal.contextMenu.copy'),
          paste: t('terminal.contextMenu.paste'),
          selectAll: t('terminal.contextMenu.selectAll'),
        }}
        onClose={() => setContextMenu(null)}
      />
    </div>
  )
}
