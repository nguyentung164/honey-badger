import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setState } = vi.hoisted(() => ({ setState: vi.fn() }))
vi.mock('@/stores/useConfigurationStore', () => ({ useConfigurationStore: { setState } }))
vi.mock('@/stores/useAppearanceStore', () => ({ useButtonVariant: () => 'default' }))
vi.mock('@/components/ui-elements/Toast', () => ({ default: { warning: vi.fn(), error: vi.fn() } }))

import { selectSourceFolder } from './SourceFolderWelcome'

describe('initial source folder selection', () => {
  const selectFolder = vi.fn()
  const detectVersionControl = vi.fn()
  const patch = vi.fn()
  let configurationChanged: (event: Event) => void

  beforeEach(() => {
    vi.clearAllMocks()
    selectFolder.mockResolvedValue('C:\\projects\\app')
    detectVersionControl.mockResolvedValue({ status: 'success', data: { type: 'git', isValid: true } })
    patch.mockResolvedValue(undefined)
    configurationChanged = vi.fn()
    const browserWindow = Object.assign(new EventTarget(), {
      api: { system: { select_folder: selectFolder, detect_version_control: detectVersionControl }, configuration: { patch } },
    })
    browserWindow.addEventListener('configuration-changed', configurationChanged)
    vi.stubGlobal('window', browserWindow)
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each(['git', 'svn'])('saves the detected %s VCS and folder together', async vcs => {
    detectVersionControl.mockResolvedValue({ status: 'success', data: { type: vcs, isValid: true } })
    expect(await selectSourceFolder()).toBe('selected')
    expect(detectVersionControl).toHaveBeenCalledWith('C:\\projects\\app')
    const config = { sourceFolder: 'C:\\projects\\app', versionControlSystem: vcs }
    expect(patch).toHaveBeenCalledExactlyOnceWith(config)
    expect(setState).toHaveBeenCalledExactlyOnceWith(config)
    expect(configurationChanged).toHaveBeenCalledOnce()
  })

  it.each([null, '', '   '])('keeps the welcome screen when the picker returns %s', async folder => {
    selectFolder.mockResolvedValue(folder)
    expect(await selectSourceFolder()).toBe('canceled')
    expect(detectVersionControl).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(setState).not.toHaveBeenCalled()
    expect(configurationChanged).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'none', isValid: false },
    { type: 'git', isValid: false },
  ])('does not save an invalid repository: %j', async data => {
    detectVersionControl.mockResolvedValue({ status: 'success', data })
    expect(await selectSourceFolder()).toBe('invalid')
    expect(patch).not.toHaveBeenCalled()
    expect(setState).not.toHaveBeenCalled()
  })

  it('does not change configuration if repository detection fails', async () => {
    detectVersionControl.mockResolvedValue({ status: 'error', message: 'Detection failed' })
    await expect(selectSourceFolder()).rejects.toThrow('Detection failed')
    expect(patch).not.toHaveBeenCalled()
    expect(setState).not.toHaveBeenCalled()
  })

  it('keeps the welcome screen if saving the configuration fails', async () => {
    patch.mockRejectedValue(new Error('Save failed'))
    await expect(selectSourceFolder()).rejects.toThrow('Save failed')
    expect(setState).not.toHaveBeenCalled()
    expect(configurationChanged).not.toHaveBeenCalled()
  })
})
