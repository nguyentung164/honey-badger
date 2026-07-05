import type * as Monaco from 'monaco-editor'
import { onAppMonacoBeforeMount } from '@/hooks/useAppMonacoTheme'
import { waitForDiffCompute } from '@/pages/diffviewer/diffViewerUtils'
import { getEditorGitRevealLineRange } from '@/pages/editor/lib/computeEditorGitLineChanges'

const PEEK_OVERLAY_ID = 'editor.git.peek.zone'

export type EditorGitPeekToolbar = {
  fileName: string
  detail: string
  frameColor: string
  canNext: boolean
  canPrevious: boolean
  onStage: () => void
  onRevert: () => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

/**
 * VS Code `ZoneWidget` + `PeekViewWidget` / `QuickDiffWidget`:
 * - empty view zone reserves height + reports `onDomNodeTop`
 * - overlay widget (`getPosition: null`) hosts interactive peek UI
 * - modified diff side uses the host editor model (gutter revert syncs to buffer)
 */
export class EditorGitPeekWidget {
  private overlay: Monaco.editor.IOverlayWidget | null = null
  private viewZoneId: string | null = null
  private layoutDisposable: Monaco.IDisposable | null = null
  private diffEditor: Monaco.editor.IStandaloneDiffEditor | null = null
  private originalModel: Monaco.editor.ITextModel | null = null
  private diffKeydownDisposable: Monaco.IDisposable | null = null
  private domEscapeListener: ((event: KeyboardEvent) => void) | null = null

  private readonly domNode: HTMLElement
  private readonly container: HTMLElement
  private readonly head: HTMLElement
  private readonly actions: HTMLElement
  private readonly body: HTMLElement

  constructor(
    private readonly editor: Monaco.editor.IStandaloneCodeEditor,
    private readonly monaco: typeof Monaco
  ) {
    this.domNode = document.createElement('div')
    this.domNode.className = 'zone-widget peekview-widget dirty-diff editor-git-peek-root'

    this.container = document.createElement('div')
    this.container.className = 'zone-widget-container'
    this.domNode.appendChild(this.container)

    this.head = document.createElement('div')
    this.head.className = 'head peekview-head'

    const title = document.createElement('div')
    title.className = 'peekview-title'

    const fileNameEl = document.createElement('span')
    fileNameEl.className = 'filename editor-git-peek-filename'
    title.appendChild(fileNameEl)

    const meta = document.createElement('span')
    meta.className = 'meta editor-git-peek-detail'
    title.appendChild(meta)

    this.actions = document.createElement('div')
    this.actions.className = 'peekview-actions editor-git-peek-actions'

    this.head.append(title, this.actions)

    this.body = document.createElement('div')
    this.body.className = 'body peekview-body editor-git-peek-body'

    this.container.append(this.head, this.body)
  }

  get isOpen(): boolean {
    return this.overlay != null
  }

  private syncLayoutGeometry(): void {
    const layout = this.editor.getLayoutInfo()
    const width = layout.width - layout.minimap.minimapWidth - layout.verticalScrollbarWidth
    const left =
      layout.minimap.minimapWidth > 0 && layout.minimap.minimapLeft === 0 ? layout.minimap.minimapWidth : 0
    this.domNode.style.width = `${width}px`
    this.domNode.style.left = `${left}px`
    this.diffEditor?.layout({ width, height: this.body.clientHeight })
  }

  private decoratingHeightPx(): number {
    const lineHeight = this.editor.getOption(this.monaco.editor.EditorOption.lineHeight)
    const frameThickness = Math.max(1, Math.round(lineHeight / 9))
    return frameThickness * 2
  }

  private layoutContainer(heightPx: number): void {
    const frameThickness = Math.max(1, Math.round(this.editor.getOption(this.monaco.editor.EditorOption.lineHeight) / 9))
    const containerHeight = Math.max(0, heightPx - this.decoratingHeightPx())
    this.container.style.borderTopWidth = `${frameThickness}px`
    this.container.style.borderBottomWidth = `${frameThickness}px`
    this.container.style.height = `${containerHeight}px`
    this.body.style.height = `${Math.max(0, containerHeight - this.head.offsetHeight)}px`
    this.syncLayoutGeometry()
  }

  private makeActionBtn(iconClass: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `editor-git-peek-btn codicon ${iconClass}`
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.disabled = disabled
    btn.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (!btn.disabled) onClick()
    })
    return btn
  }

  private renderToolbar(toolbar: EditorGitPeekToolbar): void {
    const title = this.head.querySelector('.peekview-title')
    const fileNameEl = title?.querySelector('.filename') as HTMLElement | null
    const metaEl = title?.querySelector('.meta') as HTMLElement | null
    if (!fileNameEl || !metaEl) return
    fileNameEl.textContent = toolbar.fileName
    metaEl.textContent = toolbar.detail

    this.container.style.borderTopColor = toolbar.frameColor
    this.container.style.borderBottomColor = toolbar.frameColor

    this.actions.replaceChildren(
      this.makeActionBtn('codicon-diff-added', 'Stage Change', toolbar.onStage),
      this.makeActionBtn('codicon-discard', 'Revert Change', toolbar.onRevert),
      this.makeActionBtn('codicon-chevron-down', 'Show Next Change', toolbar.onNext, !toolbar.canNext),
      this.makeActionBtn('codicon-chevron-up', 'Show Previous Change', toolbar.onPrevious, !toolbar.canPrevious),
      this.makeActionBtn('codicon-close', 'Close', toolbar.onClose)
    )
  }

  private bindEscapeHandlers(onEscape: () => void): void {
    const handleEscape = (e: Monaco.IKeyboardEvent) => {
      if (e.keyCode !== this.monaco.KeyCode.Escape) return
      e.preventDefault()
      e.stopPropagation()
      onEscape()
    }

    if (this.diffEditor) {
      this.diffKeydownDisposable = this.diffEditor.getModifiedEditor().onKeyDown(handleEscape)
      this.diffEditor.getModifiedEditor().addCommand(this.monaco.KeyCode.Escape, onEscape)
      this.diffEditor.getModifiedEditor().addCommand(this.monaco.KeyMod.Shift | this.monaco.KeyCode.Escape, onEscape)
      this.diffEditor.getOriginalEditor().addCommand(this.monaco.KeyCode.Escape, onEscape)
      this.diffEditor.getOriginalEditor().addCommand(this.monaco.KeyMod.Shift | this.monaco.KeyCode.Escape, onEscape)
    }

    this.domEscapeListener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onEscape()
    }
    this.domNode.addEventListener('keydown', this.domEscapeListener, true)
  }

  show(
    anchorLine: number,
    heightInLines: number,
    toolbar: EditorGitPeekToolbar,
    originalText: string,
    languageId: string,
    change: Monaco.editor.ILineChange,
    onEscape: () => void
  ): void {
    this.hide()

    const modifiedModel = this.editor.getModel()
    if (!modifiedModel) return

    this.renderToolbar(toolbar)
    this.syncLayoutGeometry()

    const viewZoneDomNode = document.createElement('div')
    viewZoneDomNode.style.overflow = 'hidden'
    viewZoneDomNode.style.pointerEvents = 'none'

    this.domNode.style.top = '-1000px'

    this.editor.changeViewZones(accessor => {
      this.viewZoneId = accessor.addZone({
        afterLineNumber: anchorLine,
        heightInLines,
        domNode: viewZoneDomNode,
        suppressMouseDown: true,
        onDomNodeTop: top => {
          this.domNode.style.top = `${top}px`
        },
        onComputedHeight: height => {
          this.domNode.style.height = `${height}px`
          this.layoutContainer(height)
        },
      })
    })

    const overlayWidget: Monaco.editor.IOverlayWidget = {
      getId: () => PEEK_OVERLAY_ID,
      getDomNode: () => this.domNode,
      getPosition: () => null,
    }
    this.overlay = overlayWidget
    this.editor.addOverlayWidget(overlayWidget)

    this.layoutDisposable = this.editor.onDidLayoutChange(() => this.syncLayoutGeometry())

    onAppMonacoBeforeMount(this.monaco)
    this.diffEditor = this.monaco.editor.createDiffEditor(this.body, {
      renderSideBySide: false,
      readOnly: false,
      automaticLayout: false,
      diffAlgorithm: 'advanced',
      ignoreTrimWhitespace: false,
      fixedOverflowWidgets: true,
      renderIndicators: false,
      renderMarginRevertIcon: true,
      renderGutterMenu: true,
      renderOverviewRuler: false,
      minimap: { enabled: false },
      lineNumbers: 'on',
      glyphMargin: true,
      folding: false,
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 14,
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
      },
      fontSize: this.editor.getOption(this.monaco.editor.EditorOption.fontSize),
      fontFamily: this.editor.getOption(this.monaco.editor.EditorOption.fontFamily),
      lineHeight: this.editor.getOption(this.monaco.editor.EditorOption.lineHeight),
    })

    this.originalModel = this.monaco.editor.createModel(originalText, languageId)
    this.diffEditor.setModel({ original: this.originalModel, modified: modifiedModel })

    this.bindEscapeHandlers(onEscape)

    void (async () => {
      const diffEditor = this.diffEditor
      if (!diffEditor) return
      await waitForDiffCompute(diffEditor)
      if (this.diffEditor !== diffEditor) return
      const { start, end } = getEditorGitRevealLineRange(change)
      const focusLine = Math.max(1, Math.floor((start + end) / 2))
      diffEditor.getModifiedEditor().revealLineInCenter(focusLine)
    })()

    this.editor.revealLineInCenterIfOutsideViewport(anchorLine)
    this.editor.focus()
  }

  updateOriginalHead(text: string): void {
    if (!this.originalModel) return
    if (this.originalModel.getValue() !== text) {
      this.originalModel.setValue(text)
    }
  }

  hide(): void {
    if (this.domEscapeListener) {
      this.domNode.removeEventListener('keydown', this.domEscapeListener, true)
      this.domEscapeListener = null
    }

    this.diffKeydownDisposable?.dispose()
    this.diffKeydownDisposable = null
    this.layoutDisposable?.dispose()
    this.layoutDisposable = null

    this.diffEditor?.dispose()
    this.diffEditor = null
    this.originalModel?.dispose()
    this.originalModel = null

    if (this.overlay) {
      this.editor.removeOverlayWidget(this.overlay)
      this.overlay = null
    }

    if (this.viewZoneId) {
      const zoneId = this.viewZoneId
      this.viewZoneId = null
      this.editor.changeViewZones(accessor => {
        accessor.removeZone(zoneId)
      })
    }

    this.domNode.style.top = '-1000px'
    this.body.replaceChildren()
  }

  dispose(): void {
    this.hide()
  }
}
