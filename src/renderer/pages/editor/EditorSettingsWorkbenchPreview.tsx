'use client'

import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import {
  SETTINGS_FONT_CAPTION,
  SETTINGS_FONT_MICRO,
  SETTINGS_FONT_NANO,
  SettingsPreviewHintChips,
} from '@/components/settings/settingsDialogUi'
import { cn } from '@/lib/utils'
import { useEditorMonacoSettings } from '@/pages/editor/hooks/useEditorSettings'
import { EditorFileBreadcrumbs } from '@/pages/editor/editor-area/EditorFileBreadcrumbs'
import { collectEditorSettingsPreviewBehaviorHints } from '@/pages/editor/lib/editorSettingsPreviewHints'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import { resolveEditorThemePreviewColors } from '@/pages/editor/lib/editorMonacoTheme'
import { resolveAppIsDarkFromDocument } from '@/lib/theme/appThemeMode'

const PREVIEW_WORKSPACE_LABEL = 'honey-badger'
const PREVIEW_FILE_PATH = 'src/pages/editor/EditorSettingsPreview.tsx'
const PREVIEW_RESTORED_TABS = ['EditorWorkbench.tsx', 'EditorSettingsPreview.tsx', 'types.ts'] as const

type TreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: TreeNode[]
}

const PREVIEW_TREE: TreeNode[] = [
  {
    name: 'src',
    path: 'src',
    kind: 'dir',
    children: [
      {
        name: 'pages',
        path: 'src/pages',
        kind: 'dir',
        children: [
          {
            name: 'editor',
            path: 'src/pages/editor',
            kind: 'dir',
            children: [{ name: 'EditorSettingsPreview.tsx', path: PREVIEW_FILE_PATH, kind: 'file' }],
          },
        ],
      },
    ],
  },
]

function ExplorerTreeMock({
  activePath,
  highlight,
  depth = 0,
  nodes = PREVIEW_TREE,
}: {
  activePath: string
  highlight: boolean
  depth?: number
  nodes?: TreeNode[]
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map(node => {
        const isActive = highlight && node.path === activePath
        const paddingLeft = 4 + depth * 12
        return (
          <li key={node.path}>
            <div
              className={cn(
                'flex h-5 items-center gap-1 rounded-sm pr-1.5 leading-none',
                SETTINGS_FONT_CAPTION,
                isActive ? 'bg-primary/15 text-foreground ring-1 ring-primary/25' : 'text-muted-foreground'
              )}
              style={{ paddingLeft }}
              aria-current={isActive ? 'true' : undefined}
            >
              {node.kind === 'dir' ? (
                <>
                  <ChevronDown className="size-2.5 shrink-0 opacity-70" aria-hidden />
                  <MaterialFileIcon name={node.name} kind="folder" className="size-3 shrink-0 opacity-80" />
                </>
              ) : (
                <>
                  <span className="size-2.5 shrink-0" aria-hidden />
                  <MaterialFileIcon name={node.name} kind="file" className="size-3 shrink-0 opacity-80" />
                </>
              )}
              <span className="min-w-0 truncate">{node.name}</span>
            </div>
            {node.children?.length ? (
              <ExplorerTreeMock activePath={activePath} highlight={highlight} depth={depth + 1} nodes={node.children} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

type EditorSettingsWorkbenchPreviewProps = {
  className?: string
}

export function EditorSettingsWorkbenchPreview({ className }: EditorSettingsWorkbenchPreviewProps) {
  const { t } = useTranslation()
  const settings = useEditorMonacoSettings()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const colors = useMemo(() => {
    void appAppearanceKey
    return resolveEditorThemePreviewColors(resolveAppIsDarkFromDocument())
  }, [appAppearanceKey])
  const autoSaveOn = settings.autoSave === 'afterDelay'
  const autoSaveLabel = autoSaveOn
    ? t('editor.settings.previewAutoSaveOn', { delay: (settings.autoSaveDelayMs / 1000).toFixed(1) })
    : t('editor.settings.previewAutoSaveOff')
  const saveHints = collectEditorSettingsPreviewBehaviorHints(settings, t, 'workbench')

  return (
    <div className={cn('flex h-full min-h-[18rem] flex-col overflow-hidden rounded-md border border-border/60 shadow-sm', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/10 px-2.5 py-1">
        <span className={cn(SETTINGS_FONT_MICRO, 'font-medium uppercase tracking-wider text-muted-foreground')}>{t('editor.settings.previewWorkbench')}</span>
        <span className={cn(SETTINGS_FONT_MICRO, 'text-muted-foreground/80')}>{autoSaveLabel}</span>
      </div>

      <div className="flex min-h-0 flex-1 bg-background">
        <div className="flex w-[42%] min-w-0 flex-col border-r border-border/60 bg-muted/8">
          <div className={cn('border-b border-border/50 px-2 py-1 font-medium uppercase tracking-wide text-muted-foreground', SETTINGS_FONT_MICRO)}>Explorer</div>
          <div className="min-h-0 flex-1 overflow-hidden p-1.5">
            {settings.explorerAutoReveal ? (
              <ExplorerTreeMock activePath={PREVIEW_FILE_PATH} highlight />
            ) : (
              <div className={cn('space-y-1 px-1 py-2 text-muted-foreground/70', SETTINGS_FONT_CAPTION)}>
                <div className="flex items-center gap-1">
                  <ChevronRight className="size-2.5" aria-hidden />
                  <span>src</span>
                </div>
                <p className="leading-relaxed">{t('editor.settings.previewExplorerIdle')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 bg-muted/12 px-1 py-0.5">
            {(settings.restoreEditorTabs ? PREVIEW_RESTORED_TABS : [PREVIEW_RESTORED_TABS[1]]).map(tabName => {
              const active = tabName === 'EditorSettingsPreview.tsx'
              return (
                <div
                  key={tabName}
                  className={cn(
                    'flex max-w-[7rem] shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5',
                    SETTINGS_FONT_MICRO,
                    active ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground'
                  )}
                >
                  <FileCode2 className="size-2.5 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{tabName}</span>
                </div>
              )
            })}
          </div>

          {settings.breadcrumbs ? (
            <EditorFileBreadcrumbs relativePath={PREVIEW_FILE_PATH} workspaceLabel={PREVIEW_WORKSPACE_LABEL} />
          ) : (
            <div className={cn('shrink-0 border-b border-border/40 px-3 py-1 italic text-muted-foreground/45', SETTINGS_FONT_CAPTION)}>{t('editor.settings.previewBreadcrumbsHidden')}</div>
          )}

          {settings.stickyScroll ? (
            <div className={cn('shrink-0 border-b border-border/50 bg-muted/25 px-2 py-0.5 font-mono text-muted-foreground', SETTINGS_FONT_NANO)}>
              export function preview()
            </div>
          ) : null}

          <div
            className={cn('min-h-0 flex-1 overflow-hidden p-2 font-mono leading-relaxed', SETTINGS_FONT_MICRO)}
            style={{ background: colors.background, color: colors.foreground }}
          >
            {settings.codeLens ? (
              <div className={cn('mb-0.5 font-medium text-primary/75', SETTINGS_FONT_NANO)}>2 references</div>
            ) : null}
            <span style={{ color: colors.keyword }}>export</span>{' '}
            <span style={{ color: colors.keyword }}>function</span>{' '}
            <span style={{ color: colors.function }}>preview</span>
            <span>{'() {'}</span>
            <br />
            <span>{'  '}</span>
            <span style={{ color: colors.keywordControl }}>return</span>{' '}
            <span style={{ color: colors.string }}>'workbench'</span>
            <br />
            <span>{'}'}</span>
            <br />
            <span style={{ color: colors.comment }}>{'// inlay hints · unused · links'}</span>
            <br />
            <span style={{ color: colors.type }}>const</span>{' '}
            <span style={{ color: colors.variable }}>appId</span>
            {settings.inlayHints ? <span className="opacity-45">: string</span> : null}
            <span>{' = '}</span>
            <span style={{ color: colors.string }}>{'`com.example.my-app`'}</span>
            <br />
            <span style={{ color: colors.type }}>const</span>{' '}
            <span className={cn(settings.showUnused && 'opacity-45')} style={{ color: colors.variable }}>
              unusedPreview
            </span>
            {settings.inlayHints ? <span className="opacity-45">: number</span> : null}
            <span>{' = 42'}</span>
            <br />
            <span style={{ color: colors.comment }}>{'// '}</span>
            {settings.links ? (
              <span className="underline decoration-primary/50 underline-offset-2 text-primary/85">https://example.com/docs</span>
            ) : (
              <span style={{ color: colors.string }}>https://example.com/docs</span>
            )}
          </div>

          <div className={cn('flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-muted/15 px-2 py-1', SETTINGS_FONT_MICRO)}>
            <span className="truncate text-muted-foreground">EditorSettingsPreview.tsx</span>
            <SettingsPreviewHintChips bare hints={[autoSaveLabel, ...saveHints]} className="max-w-[72%] justify-end" />
          </div>
        </div>
      </div>
    </div>
  )
}
