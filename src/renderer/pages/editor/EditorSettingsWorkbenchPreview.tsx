'use client'

import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialFileIcon } from '@/components/icons/MaterialFileIcon'
import { cn } from '@/lib/utils'
import type { EditorSettings } from '@/pages/editor/hooks/useEditorSettings'
import { EditorFileBreadcrumbs } from '@/pages/editor/editor-area/EditorFileBreadcrumbs'
import { EDITOR_SETTINGS_PREVIEW_HEIGHT } from '@/pages/editor/lib/buildEditorSettingsPreviewOptions'
import { useAppAppearanceThemeKey } from '@/hooks/useAppAppearanceThemeKey'
import { resolveEditorThemePreviewColors } from '@/pages/editor/lib/editorMonacoTheme'
import { resolveAppIsDarkFromDocument } from '@/lib/theme/appThemeMode'

const PREVIEW_WORKSPACE_LABEL = 'honey-badger'
const PREVIEW_FILE_PATH = 'src/pages/editor/EditorSettingsPreview.tsx'

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
                'flex h-5 items-center gap-1 rounded-sm pr-1.5 text-[10px] leading-none',
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
  settings: EditorSettings
  className?: string
}

export function EditorSettingsWorkbenchPreview({ settings, className }: EditorSettingsWorkbenchPreviewProps) {
  const { t } = useTranslation()
  const appAppearanceKey = useAppAppearanceThemeKey()
  const colors = useMemo(() => {
    void appAppearanceKey
    return resolveEditorThemePreviewColors(resolveAppIsDarkFromDocument())
  }, [appAppearanceKey])
  const autoSaveOn = settings.autoSave === 'afterDelay'
  const autoSaveLabel = autoSaveOn
    ? t('editor.settings.previewAutoSaveOn', { delay: (settings.autoSaveDelayMs / 1000).toFixed(1) })
    : t('editor.settings.previewAutoSaveOff')

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70 shadow-inner', className)}>
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/15 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('editor.settings.previewWorkbench')}</span>
        <span className="text-[10px] text-muted-foreground/80">{autoSaveLabel}</span>
      </div>

      <div className="flex bg-background" style={{ height: EDITOR_SETTINGS_PREVIEW_HEIGHT }}>
        <div className="flex w-[42%] min-w-0 flex-col border-r border-border/60 bg-muted/8">
          <div className="border-b border-border/50 px-2 py-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Explorer</div>
          <div className="min-h-0 flex-1 overflow-hidden p-1.5">
            {settings.explorerAutoReveal ? (
              <ExplorerTreeMock activePath={PREVIEW_FILE_PATH} highlight />
            ) : (
              <div className="space-y-1 px-1 py-2 text-[10px] text-muted-foreground/70">
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
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-muted/12 px-2 py-1">
            <FileCode2 className="size-3 shrink-0 text-primary/80" aria-hidden />
            <span className="truncate text-[10px] font-medium text-foreground">EditorSettingsPreview.tsx</span>
          </div>

          {settings.breadcrumbs ? (
            <EditorFileBreadcrumbs relativePath={PREVIEW_FILE_PATH} workspaceLabel={PREVIEW_WORKSPACE_LABEL} />
          ) : (
            <div className="shrink-0 border-b border-border/40 px-3 py-1 text-[10px] italic text-muted-foreground/45">{t('editor.settings.previewBreadcrumbsHidden')}</div>
          )}

          <div
            className="min-h-0 flex-1 overflow-hidden p-2 font-mono text-[9px] leading-relaxed"
            style={{ background: colors.background, color: colors.foreground }}
          >
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
            <span style={{ color: colors.comment }}>{'// type · variable · number'}</span>
            <br />
            <span style={{ color: colors.type }}>const</span>{' '}
            <span style={{ color: colors.variable }}>count</span>
            <span>{': '}</span>
            <span style={{ color: colors.type }}>number</span>
            <span>{' = '}</span>
            <span style={{ color: colors.number }}>42</span>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/15 px-2 py-0.5 text-[9px] text-muted-foreground">
            <span className="truncate">EditorSettingsPreview.tsx</span>
            <span className={cn('shrink-0 tabular-nums', autoSaveOn ? 'text-primary/90' : 'text-muted-foreground/60')}>{autoSaveLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
