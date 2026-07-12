import { Eraser, Loader, Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_SHELL_PROFILE_LABEL_KEYS, type TerminalShellProfileId, type TerminalShellProfileInfo } from 'shared/terminal/shells'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTerminalPrefs } from '@/hooks/useTerminalPrefs'
import { resolveTerminalTabCwd } from '@/lib/terminal/resolveTerminalTabCwd'
import { subscribeTerminalLaunch } from '@/lib/terminal/terminalLaunchBridge'
import { resolveTerminalTabTitle } from '@/lib/terminal/terminalPrefs'
import { type PersistedTerminalTab, readPersistedTerminalSession, writePersistedTerminalSession } from '@/lib/terminal/terminalSessionPersist'
import type { TerminalShellIntegrationState } from '@/lib/terminal/terminalShellIntegration'
import { cn } from '@/lib/utils'
import { TerminalSettingsDialog } from '@/pages/main/TerminalSettingsDialog'
import { TerminalShellTabIcon } from '@/pages/main/TerminalShellTabIcon'
import { TerminalTabPane } from '@/pages/main/TerminalTabPane'

type TerminalTabState = {
  id: string
  shellProfileId: TerminalShellProfileId
  cwd?: string
  integrationCwd?: string
  commandRunning?: boolean
}

function createTab(shellProfileId: TerminalShellProfileId, cwd?: string): TerminalTabState {
  return { id: crypto.randomUUID(), shellProfileId, cwd }
}

function tabDisplayCwd(tab: TerminalTabState): string | undefined {
  return tab.integrationCwd ?? tab.cwd
}

type IntegratedTerminalPanelProps = {
  repoCwd?: string
  panelVisible: boolean
  onClose: () => void
}

export function IntegratedTerminalPanel({ repoCwd, panelVisible, onClose }: IntegratedTerminalPanelProps) {
  const { t } = useTranslation()
  const { prefs, updatePrefs } = useTerminalPrefs()
  const [availableShells, setAvailableShells] = useState<TerminalShellProfileInfo[]>([])
  const [tabs, setTabs] = useState<TerminalTabState[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [restartKeys, setRestartKeys] = useState<Record<string, number>>({})
  const [clearKeys, setClearKeys] = useState<Record<string, number>>({})
  const [tabsReady, setTabsReady] = useState(false)
  const [pasteDialog, setPasteDialog] = useState<{ lineCount: number; resolve: (value: boolean) => void } | null>(null)
  const [killDialog, setKillDialog] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null)

  const shellLabel = useCallback((id: TerminalShellProfileId) => t(TERMINAL_SHELL_PROFILE_LABEL_KEYS[id]), [t])

  const tabBaseLabel = useCallback(
    (tab: TerminalTabState) =>
      resolveTerminalTabTitle({
        mode: prefs.tabTitleMode,
        customTitle: prefs.tabTitleCustom,
        shellLabel: shellLabel(tab.shellProfileId),
        cwd: tabDisplayCwd(tab),
      }),
    [prefs.tabTitleMode, prefs.tabTitleCustom, shellLabel]
  )

  useEffect(() => {
    if (!tabsReady) return
    return subscribeTerminalLaunch(({ absoluteCwd }) => {
      const tab = createTab(prefs.defaultShellProfileId, absoluteCwd)
      setTabs(prev => [...prev, tab])
      setActiveTabId(tab.id)
    })
  }, [prefs.defaultShellProfileId, tabsReady])

  const persistSession = useCallback(
    (nextTabs: TerminalTabState[], nextActiveId: string) => {
      if (!prefs.reviveTabsOnLaunch) return
      const payload: PersistedTerminalTab[] = nextTabs.map(tab => ({
        id: tab.id,
        shellProfileId: tab.shellProfileId,
        cwd: tab.cwd,
      }))
      writePersistedTerminalSession({
        tabs: payload,
        activeTabId: nextActiveId,
      })
    },
    [prefs.reviveTabsOnLaunch]
  )

  useEffect(() => {
    void window.api.terminal.listShells().then(setAvailableShells)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const persisted = prefs.reviveTabsOnLaunch ? readPersistedTerminalSession() : null
      if (persisted && persisted.tabs.length > 0) {
        const revivedTabs: TerminalTabState[] = persisted.tabs.map(tab => ({
          id: tab.id,
          shellProfileId: tab.shellProfileId,
          cwd: tab.cwd,
        }))
        if (cancelled) return
        setTabs(revivedTabs)
        setActiveTabId(persisted.activeTabId || revivedTabs[0].id)
        setTabsReady(true)
        return
      }

      const cwd = await resolveTerminalTabCwd(prefs, repoCwd)
      if (cancelled) return
      const tab = createTab(prefs.defaultShellProfileId, cwd)
      setTabs([tab])
      setActiveTabId(tab.id)
      setTabsReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!tabsReady || tabs.length === 0) return
    persistSession(tabs, activeTabId)
  }, [tabs, activeTabId, tabsReady, persistSession])

  const confirmMultiLinePaste = useCallback(
    (text: string) => {
      if (!prefs.enableMultiLinePasteWarning) return Promise.resolve(true)
      const lineCount = text.split(/\r\n|\n|\r/).length
      return new Promise<boolean>(resolve => {
        setPasteDialog({ lineCount, resolve })
      })
    },
    [prefs.enableMultiLinePasteWarning]
  )

  const requestKillConfirm = useCallback(
    (commandRunning: boolean, title: string, description: string, onConfirm: () => void) => {
      if (!prefs.confirmOnKill || !commandRunning) {
        queueMicrotask(onConfirm)
        return
      }
      setKillDialog({ title, description, onConfirm })
    },
    [prefs.confirmOnKill]
  )

  const addTab = useCallback(
    (shellProfileId: TerminalShellProfileId) => {
      void (async () => {
        const cwd = await resolveTerminalTabCwd(prefs, repoCwd)
        const tab = createTab(shellProfileId, cwd)
        setTabs(prev => [...prev, tab])
        setActiveTabId(tab.id)
      })()
    },
    [prefs, repoCwd]
  )

  const changeTabShell = useCallback(
    (tabId: string, shellProfileId: TerminalShellProfileId) => {
      const tab = tabs.find(item => item.id === tabId)
      if (tab?.shellProfileId === shellProfileId) return
      setTabs(prev => prev.map(item => (item.id === tabId ? { ...item, shellProfileId } : item)))
      setRestartKeys(prev => ({ ...prev, [tabId]: (prev[tabId] ?? 0) + 1 }))
    },
    [tabs]
  )

  const updateTabIntegration = useCallback((tabId: string, state: TerminalShellIntegrationState) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? {
            ...tab,
            integrationCwd: state.cwd ?? tab.integrationCwd,
            commandRunning: state.commandRunning,
          }
          : tab
      )
    )
  }, [])

  const closeTabNow = useCallback(
    (tabId: string) => {
      void window.api.terminal.destroy(tabId)

      if (tabs.length <= 1) {
        queueMicrotask(() => onClose())
        return
      }

      const index = tabs.findIndex(tab => tab.id === tabId)
      const next = tabs.filter(tab => tab.id !== tabId)
      const fallback = next[Math.max(0, index - 1)]
      setTabs(next)
      if (activeTabId === tabId && fallback) {
        setActiveTabId(fallback.id)
      }
      setRestartKeys(prev => {
        const updated = { ...prev }
        delete updated[tabId]
        return updated
      })
      setClearKeys(prev => {
        const updated = { ...prev }
        delete updated[tabId]
        return updated
      })
    },
    [tabs, activeTabId, onClose]
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find(item => item.id === tabId)
      requestKillConfirm(
        Boolean(tab?.commandRunning),
        t('terminal.confirmKill.closeTitle'),
        t('terminal.confirmKill.closeDescription', { name: tab ? tabBaseLabel(tab) : '' }),
        () => closeTabNow(tabId)
      )
    },
    [tabs, requestKillConfirm, t, tabBaseLabel, closeTabNow]
  )

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId) ?? tabs[0], [tabs, activeTabId])

  const restartActiveTabNow = useCallback(() => {
    if (!activeTab) return
    setRestartKeys(prev => ({ ...prev, [activeTab.id]: (prev[activeTab.id] ?? 0) + 1 }))
  }, [activeTab])

  const restartActiveTab = useCallback(() => {
    if (!activeTab) return
    requestKillConfirm(
      Boolean(activeTab?.commandRunning),
      t('terminal.confirmKill.restartTitle'),
      t('terminal.confirmKill.restartDescription', { name: tabBaseLabel(activeTab) }),
      restartActiveTabNow
    )
  }, [activeTab, requestKillConfirm, t, tabBaseLabel, restartActiveTabNow])

  const clearActiveTab = useCallback(() => {
    if (!activeTab) return
    setClearKeys(prev => ({ ...prev, [activeTab.id]: (prev[activeTab.id] ?? 0) + 1 }))
  }, [activeTab])

  const selectTab = useCallback((tabId: string) => {
    if (tabId === activeTabId) return
    setActiveTabId(tabId)
  }, [activeTabId])

  if (!tabsReady) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-background" aria-label={t('terminal.title')}>
        <div className="flex h-8 shrink-0 items-center border-b border-border/60 px-2 text-xs text-muted-foreground">{t('terminal.loading')}</div>
      </section>
    )
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-background', !panelVisible && 'hidden')} aria-label={t('terminal.title')} aria-hidden={!panelVisible}>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-t border-border/60 px-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map(tab => {
            const isFocused = tab.id === activeTabId
            const isRunning = Boolean(tab.commandRunning)
            const label = tabBaseLabel(tab)
            return (
              <ContextMenu key={tab.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      'group flex h-6 max-w-[11rem] shrink-0 items-center gap-0.5 rounded-sm pl-2 pr-1 text-xs',
                      isRunning
                        ? isFocused
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'text-emerald-600/90 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400/90 dark:hover:text-emerald-400'
                        : isFocused
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 truncate text-left',
                        isRunning && 'text-emerald-600 dark:text-emerald-400'
                      )}
                      onClick={() => selectTab(tab.id)}
                      title={label}
                    >
                      {label}
                    </button>
                    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      {isRunning ? (
                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0"
                          aria-hidden
                        >
                          <Loader className="size-3 animate-spin text-emerald-600 dark:text-emerald-400" />
                        </span>
                      ) : (
                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0"
                          aria-hidden
                        >
                          <TerminalShellTabIcon shellProfileId={tab.shellProfileId} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex h-full w-full items-center justify-center rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={e => {
                          e.stopPropagation()
                          closeTab(tab.id)
                        }}
                        aria-label={t('terminal.closeTab')}
                      >
                        <X className="size-3 text-red-500 transition-colors hover:text-red-600 dark:text-red-400 dark:hover:text-red-300" />
                      </button>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-[12rem]">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>{t('terminal.changeShell')}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-[12rem]">
                      {availableShells.map(shell => (
                        <ContextMenuItem key={shell.id} onClick={() => changeTabShell(tab.id, shell.id)}>
                          {shellLabel(shell.id)}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => setRestartKeys(prev => ({ ...prev, [tab.id]: (prev[tab.id] ?? 0) + 1 }))}>
                    {t('terminal.restart')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0 px-0" aria-label={t('terminal.newTerminal')}>
                <Plus className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              {availableShells.map(shell => (
                <DropdownMenuItem key={shell.id} onClick={() => addTab(shell.id)}>
                  {shellLabel(shell.id)}
                </DropdownMenuItem>
              ))}
              {availableShells.length === 0 ? <DropdownMenuItem disabled>{t('terminal.noShells')}</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/40 pl-1">
          <TerminalSettingsDialog prefs={prefs} availableShells={availableShells} onPrefsChange={updatePrefs} />
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={clearActiveTab} aria-label={t('terminal.clear')}>
            <Eraser className="size-3" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={restartActiveTab} aria-label={t('terminal.restart')}>
            <RotateCcw className="size-3" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={onClose} aria-label={t('terminal.close')}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.map(tab => (
          <TerminalTabPane
            key={`${tab.id}:${tab.shellProfileId}:${restartKeys[tab.id] ?? 0}`}
            terminalId={tab.id}
            visible={tab.id === activeTabId}
            focused={tab.id === activeTabId && panelVisible}
            panelVisible={panelVisible}
            cwd={tab.cwd}
            shellProfileId={tab.shellProfileId}
            prefs={prefs}
            shouldPersist={prefs.keepSessionsWhenPanelClosed}
            tryAttach={prefs.reviveTabsOnLaunch && (restartKeys[tab.id] ?? 0) === 0}
            restartNonce={restartKeys[tab.id] ?? 0}
            clearNonce={clearKeys[tab.id] ?? 0}
            confirmMultiLinePaste={confirmMultiLinePaste}
            onShellIntegrationChange={state => updateTabIntegration(tab.id, state)}
          />
        ))}
      </div>

      <AlertDialog
        open={pasteDialog !== null}
        onOpenChange={open => {
          if (!open && pasteDialog) {
            pasteDialog.resolve(false)
            setPasteDialog(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('terminal.multiLinePaste.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('terminal.multiLinePaste.description', { count: pasteDialog?.lineCount ?? 0 })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pasteDialog?.resolve(false)
                setPasteDialog(null)
              }}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pasteDialog?.resolve(true)
                setPasteDialog(null)
              }}
            >
              {t('terminal.multiLinePaste.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={killDialog !== null} onOpenChange={open => !open && setKillDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{killDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{killDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                killDialog?.onConfirm()
                setKillDialog(null)
              }}
            >
              {t('terminal.confirmKill.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
