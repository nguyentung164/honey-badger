import { ipcMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../constants'
import { createOpenAIResponse } from '../ai/openaiConnection'
import configurationStore from '../store/ConfigurationStore'
import { registerOpenAiIpcHandlers } from './openai'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), error: vi.fn() } }))
vi.mock('../store/ConfigurationStore', () => ({ default: { store: { openaiConnectionMode: 'api-key', openaiApiKey: 'saved-key' } } }))
vi.mock('../ai/openaiConnection', () => ({ createOpenAIResponse: vi.fn(), isOpenAIConfigured: vi.fn(() => true) }))
vi.mock('../ai/aiPricing', () => ({ estimateCostUsd: vi.fn() }))
vi.mock('../task/aiUsageDb', () => ({ appendAiUsageEvent: vi.fn() }))
vi.mock('../task/auth', () => ({ getTokenFromStore: vi.fn(), verifyToken: vi.fn() }))
vi.mock('../task/stores/pgTaskStore', () => ({ getCodingRuleContentByIdOrName: vi.fn() }))

describe('OpenAI connection test IPC', () => {
  const settings = { openaiConnectionMode: 'codex', openaiApiKey: '', codexAuthPath: '', codexModel: '', openaiModel: 'api-model', openaiReasoningEffort: 'low' }
  beforeEach(() => vi.clearAllMocks())

  function handler() {
    registerOpenAiIpcHandlers()
    const registration = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === IPC.OPENAI.TEST_CONNECTION)
    if (!registration) throw new Error('Test connection IPC handler is missing')
    return registration[1]
  }

  it('tests the unsaved configuration and only returns model/status to the renderer', async () => {
    vi.mocked(createOpenAIResponse).mockResolvedValue({ model: 'codex-model', output_text: 'OK' } as Awaited<ReturnType<typeof createOpenAIResponse>>)
    await expect(handler()({} as Electron.IpcMainInvokeEvent, settings)).resolves.toEqual({ ok: true, model: 'codex-model' })
    expect(createOpenAIResponse).toHaveBeenCalledWith(expect.objectContaining({ input: 'Reply with only OK.' }), settings, 30_000)
    expect(configurationStore.store.openaiApiKey).toBe('saved-key')
  })

  it('returns an actionable error when the session or model fails', async () => {
    vi.mocked(createOpenAIResponse).mockRejectedValue(new Error('Run codex login'))
    await expect(handler()({} as Electron.IpcMainInvokeEvent, settings)).resolves.toEqual({ ok: false, error: 'Run codex login' })
  })

  it('rejects invalid IPC settings before making a request', async () => {
    await expect(handler()({} as Electron.IpcMainInvokeEvent, { ...settings, openaiConnectionMode: 'unknown' })).resolves.toMatchObject({ ok: false })
    expect(createOpenAIResponse).not.toHaveBeenCalled()
  })
})
