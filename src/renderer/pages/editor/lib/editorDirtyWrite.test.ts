import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDirtyWriteOnSave } from '@/pages/editor/lib/editorDirtyWrite'

vi.mock('@/pages/editor/lib/editorExternalFileSync', () => ({
  readNormalizedDiskText: vi.fn(),
}))

vi.mock('@/pages/editor/lib/editorTextModels', () => ({
  getModelBaseline: vi.fn(),
}))

import { readNormalizedDiskText } from '@/pages/editor/lib/editorExternalFileSync'
import { getModelBaseline } from '@/pages/editor/lib/editorTextModels'

const readDisk = vi.mocked(readNormalizedDiskText)
const getBaseline = vi.mocked(getModelBaseline)

describe('checkDirtyWriteOnSave', () => {
  beforeEach(() => {
    readDisk.mockReset()
    getBaseline.mockReset()
  })

  it('saves when disk is unreadable', async () => {
    readDisk.mockResolvedValue(null)
    await expect(checkDirtyWriteOnSave('/repo', 'src/a.ts', 'editor')).resolves.toEqual({ action: 'save' })
  })

  it('noops when editor already matches disk', async () => {
    readDisk.mockResolvedValue('same\ncontent')
    await expect(checkDirtyWriteOnSave('/repo', 'src/a.ts', 'same\ncontent')).resolves.toEqual({ action: 'noop' })
  })

  it('saves when disk matches last baseline (external change reverted)', async () => {
    readDisk.mockResolvedValue('baseline')
    getBaseline.mockReturnValue('baseline')
    await expect(checkDirtyWriteOnSave('/repo', 'src/a.ts', 'edited')).resolves.toEqual({ action: 'save' })
  })

  it('prompts when disk drifted and editor differs from disk', async () => {
    readDisk.mockResolvedValue('disk version')
    getBaseline.mockReturnValue('old baseline')
    await expect(checkDirtyWriteOnSave('/repo', 'src/a.ts', 'my edits')).resolves.toEqual({
      action: 'confirm',
      diskContent: 'disk version',
      editorContent: 'my edits',
    })
  })
})
