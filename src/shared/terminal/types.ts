import type { TerminalShellProfileId } from './shells'

export type TerminalCreateOptions = {
  cwd?: string
  cols?: number
  rows?: number
  shellProfileId?: TerminalShellProfileId
}

export type TerminalCreateResult =
  | { success: true; id: string }
  | { success: false; error: string }

export type TerminalDataPayload = { id: string; data: string }

export type TerminalExitPayload = { id: string; exitCode: number; signal?: number }

export type TerminalWritePayload = { id: string; data: string }

export type TerminalResizePayload = { id: string; cols: number; rows: number }
