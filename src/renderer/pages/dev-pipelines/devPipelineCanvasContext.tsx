import { createContext, useContext } from 'react'

export type DevPipelineCanvasActions = {
  canvasLocked: boolean
  runBusy: boolean
  runThisGroup: (groupId: string) => void
  runThisStep: (stepId: string) => void
  persistGroupSize: (groupId: string, size: { width: number; height: number }) => void
  persistNoteSize: (noteId: string, size: { width: number; minHeight?: number; nodeHeight?: number }) => void
  persistNoteContent: (noteId: string, content: string) => void
  deleteGroup: (groupId: string) => void
  deleteNote: (noteId: string) => void
}

export const DevPipelineCanvasContext = createContext<DevPipelineCanvasActions | null>(null)

export function useDevPipelineCanvas(): DevPipelineCanvasActions | null {
  return useContext(DevPipelineCanvasContext)
}
