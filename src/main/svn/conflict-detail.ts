import l from 'electron-log'
import configurationStore from '../store/ConfigurationStore'
import { parseConflictContent } from './conflict-parser'

export interface SvnConflictDetailResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    path: string
    isRevisionConflict: boolean
    conflictType?: 'merge' | 'update'
    content?: {
      working: string
      base: string
      theirs: string
      mine: string
    }
  }
}

export async function getSvnConflictDetail(filePath: string, sourceFolder?: string): Promise<SvnConflictDetailResponse> {
  try {
    const cwd = sourceFolder || configurationStore.store.sourceFolder
    if (!cwd) {
      return { status: 'error', message: 'No source folder configured' }
    }

    const parsed = parseConflictContent(filePath, cwd)

    return {
      status: 'success',
      data: {
        path: filePath,
        isRevisionConflict: parsed.isRevisionConflict,
        conflictType: parsed.conflictType,
        content: parsed.content,
      },
    }
  } catch (error) {
    l.error('getSvnConflictDetail error:', error)
    return {
      status: 'error',
      message: `Error getting conflict detail: ${error}`,
    }
  }
}
