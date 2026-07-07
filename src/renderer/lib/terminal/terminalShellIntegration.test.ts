import { describe, expect, it } from 'vitest'
import {
  INITIAL_SHELL_INTEGRATION_STATE,
  reduceShellIntegrationState,
  SHELL_INTEGRATION_SIGINT_EXIT_CODE,
  shellIntegrationInputEvents,
  ShellIntegrationStreamParser,
  stripShellIntegrationSequences,
} from './terminalShellIntegration'

describe('stripShellIntegrationSequences', () => {
  it('parses VS Code sequence semantics', () => {
    const { output, events } = stripShellIntegrationSequences(
      '\x1b]633;A\x07\x1b]633;C\x07\x1b]633;D;0\x07done'
    )
    expect(output).toBe('done')
    expect(events).toEqual([
      { type: 'promptStart' },
      { type: 'commandExecuted' },
      { type: 'commandFinished', exitCode: 0 },
    ])
  })

  it('parses cwd from P sequence', () => {
    const { events } = stripShellIntegrationSequences('\x1b]633;P;Cwd=/tmp\x07')
    expect(events).toEqual([{ type: 'cwd', path: '/tmp' }])
  })
})

describe('ShellIntegrationStreamParser', () => {
  it('reassembles OSC 633 split across chunks', () => {
    const parser = new ShellIntegrationStreamParser()
    const first = parser.feed('out\x1b]633;D;')
    expect(first.events).toEqual([])
    expect(first.output).toBe('out')

    const second = parser.feed('0\x07more')
    expect(second.events).toEqual([{ type: 'commandFinished', exitCode: 0 }])
    expect(second.output).toBe('more')
  })

  it('handles multiple sequences in one chunk', () => {
    const parser = new ShellIntegrationStreamParser()
    const { events, output } = parser.feed('\x1b]633;C\x07\x1b]633;D\x07done')
    expect(events).toEqual([{ type: 'commandExecuted' }, { type: 'commandFinished', exitCode: undefined }])
    expect(output).toBe('done')
  })

  it('reset clears partial carry buffer', () => {
    const parser = new ShellIntegrationStreamParser()
    parser.feed('\x1b]633;D;')
    parser.reset()
    const { events, output } = parser.feed('0\x07x')
    expect(events).toEqual([])
    expect(output).toBe('0\x07x')
  })
})

describe('reduceShellIntegrationState', () => {
  it('sets running only between C and D', () => {
    let state = INITIAL_SHELL_INTEGRATION_STATE
    state = reduceShellIntegrationState(state, { type: 'promptStart' })
    expect(state.commandRunning).toBe(false)
    state = reduceShellIntegrationState(state, { type: 'commandExecuted' })
    expect(state.commandRunning).toBe(true)
    state = reduceShellIntegrationState(state, { type: 'commandFinished', exitCode: 0 })
    expect(state.commandRunning).toBe(false)
    expect(state.lastExitCode).toBe(0)
  })

  it('does not mark running on prompt start (A)', () => {
    const running = reduceShellIntegrationState(
      { ...INITIAL_SHELL_INTEGRATION_STATE, commandRunning: true },
      { type: 'promptStart' }
    )
    expect(running.commandRunning).toBe(false)
  })

  it('updates cwd without affecting running state', () => {
    const state = reduceShellIntegrationState(
      { ...INITIAL_SHELL_INTEGRATION_STATE, commandRunning: true },
      { type: 'cwd', path: '/repo' }
    )
    expect(state.cwd).toBe('/repo')
    expect(state.commandRunning).toBe(true)
  })
})

describe('shellIntegrationInputEvents', () => {
  it('marks command finished on Ctrl+C while running', () => {
    expect(shellIntegrationInputEvents('\x03', true)).toEqual([
      { type: 'commandFinished', exitCode: SHELL_INTEGRATION_SIGINT_EXIT_CODE },
    ])
  })

  it('ignores Ctrl+C when idle at prompt', () => {
    expect(shellIntegrationInputEvents('\x03', false)).toEqual([])
  })

  it('does not infer command start from Enter', () => {
    expect(shellIntegrationInputEvents('\r', false)).toEqual([])
    expect(shellIntegrationInputEvents('\r', true)).toEqual([])
  })
})
