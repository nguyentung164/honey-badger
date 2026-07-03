import toast from '@/components/ui-elements/Toast'
import i18n from '@/lib/i18n'

export type ExplorerUndoEntry =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'create'; path: string; isDir: boolean }
  | { kind: 'delete-file'; path: string; content: string }
  | { kind: 'delete-dir'; path: string; stagingId: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'copy'; items: Array<{ from: string; to: string }> }

export type ExplorerOpCallbacks = {
  repoCwd: string
  onPathRenamed?: (from: string, to: string) => void
  onPathDeleted?: (relativePath: string, isDir: boolean) => void
  onRefresh: () => void
}

const MAX_STACK = 64

export class ExplorerUndoStack {
  private undoEntries: ExplorerUndoEntry[] = []
  private redoEntries: ExplorerUndoEntry[] = []

  clear(): void {
    this.undoEntries = []
    this.redoEntries = []
  }

  canUndo(): boolean {
    return this.undoEntries.length > 0
  }

  canRedo(): boolean {
    return this.redoEntries.length > 0
  }

  push(entry: ExplorerUndoEntry): void {
    this.undoEntries.push(entry)
    if (this.undoEntries.length > MAX_STACK) this.undoEntries.shift()
    this.redoEntries = []
  }

  async undo(ctx: ExplorerOpCallbacks): Promise<boolean> {
    const entry = this.undoEntries.pop()
    if (!entry) return false
    const ok = await this.applyReverse(entry, ctx)
    if (ok) this.redoEntries.push(entry)
    else this.undoEntries.push(entry)
    return ok
  }

  async redo(ctx: ExplorerOpCallbacks): Promise<boolean> {
    const entry = this.redoEntries.pop()
    if (!entry) return false
    const ok = await this.applyForward(entry, ctx)
    if (ok) this.undoEntries.push(entry)
    else this.redoEntries.push(entry)
    return ok
  }

  private async applyReverse(entry: ExplorerUndoEntry, ctx: ExplorerOpCallbacks): Promise<boolean> {
    const { repoCwd, onPathRenamed, onPathDeleted, onRefresh } = ctx
    try {
      switch (entry.kind) {
        case 'rename': {
          const result = await window.api.system.rename_path({ from: entry.to, to: entry.from, cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathRenamed?.(entry.to, entry.from)
          break
        }
        case 'create': {
          const result = await window.api.system.delete_path(entry.path, { cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathDeleted?.(entry.path, entry.isDir)
          break
        }
        case 'delete-file': {
          const result = await window.api.system.write_file(entry.path, entry.content, { cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          break
        }
        case 'delete-dir': {
          const result = await window.api.system.restore_undo_staging({
            stagingId: entry.stagingId,
            relativePath: entry.path,
            cwd: repoCwd,
          })
          if (!result.success) throw new Error(result.error)
          break
        }
        case 'move': {
          const result = await window.api.system.rename_path({ from: entry.to, to: entry.from, cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathRenamed?.(entry.to, entry.from)
          break
        }
        case 'copy': {
          for (const item of [...entry.items].reverse()) {
            const result = await window.api.system.delete_path(item.to, { cwd: repoCwd })
            if (!result.success) throw new Error(result.error)
          }
          break
        }
      }
      onRefresh()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('editor.explorerMenu.undoFailed'))
      return false
    }
  }

  private async applyForward(entry: ExplorerUndoEntry, ctx: ExplorerOpCallbacks): Promise<boolean> {
    const { repoCwd, onPathRenamed, onPathDeleted, onRefresh } = ctx
    try {
      switch (entry.kind) {
        case 'rename': {
          const result = await window.api.system.rename_path({ from: entry.from, to: entry.to, cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathRenamed?.(entry.from, entry.to)
          break
        }
        case 'create': {
          const result = entry.isDir
            ? await window.api.system.create_dir(entry.path, { cwd: repoCwd })
            : await window.api.system.write_file(entry.path, '', { cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          break
        }
        case 'delete-file': {
          const result = await window.api.system.delete_path(entry.path, { cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathDeleted?.(entry.path, false)
          break
        }
        case 'delete-dir': {
          const staged = await window.api.system.stage_path_for_undo(entry.path, { cwd: repoCwd })
          if (!staged.success || !staged.stagingId) throw new Error(staged.error)
          const result = await window.api.system.delete_path(entry.path, { cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathDeleted?.(entry.path, true)
          entry.stagingId = staged.stagingId
          break
        }
        case 'move': {
          const result = await window.api.system.rename_path({ from: entry.from, to: entry.to, cwd: repoCwd })
          if (!result.success) throw new Error(result.error)
          onPathRenamed?.(entry.from, entry.to)
          break
        }
        case 'copy': {
          for (const item of entry.items) {
            const result = await window.api.system.copy_path({ from: item.from, to: item.to, cwd: repoCwd })
            if (!result.success) throw new Error(result.error)
          }
          break
        }
      }
      onRefresh()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : i18n.t('editor.explorerMenu.redoFailed'))
      return false
    }
  }
}
