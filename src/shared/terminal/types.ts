import type { TerminalShellProfileId } from './shells'

export type TerminalCreateOptions = {
  /** Stable terminal tab id (UUID). Reused for attach/revive across panel reloads. */
  id?: string
  cwd?: string
  cols?: number
  rows?: number
  shellProfileId?: TerminalShellProfileId
  /** Keep PTY alive in the Pty Host when the renderer detaches (VS Code persistent terminal). */
  shouldPersist?: boolean
  /** Try attaching to an existing PTY with the same id before spawning. */
  attach?: boolean
}

export type TerminalCreateResult =
  | { success: true; id: string; attached?: boolean; replay?: string }
  | { success: false; error: string }

export type TerminalDataPayload = { id: string; data: string }

export type TerminalExitPayload = { id: string; exitCode: number; signal?: number }

export type TerminalWritePayload = { id: string; data: string }

export type TerminalResizePayload = { id: string; cols: number; rows: number }
