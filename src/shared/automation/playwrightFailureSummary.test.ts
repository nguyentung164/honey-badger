import { describe, expect, it } from 'vitest'
import {
  derivePlaywrightFailureDisplay,
  extractPlaywrightStackLocation,
  parseAssertionHintsFromPlaywrightHead,
  splitPlaywrightFailureHeadAndCallLog,
  stripAnsiForFailureDisplay,
  summarizePlaywrightFailureMessage,
} from './playwrightFailureSummary'

describe('playwrightFailureSummary', () => {
  it('strips ANSI sequences', () => {
    const raw = '\x1b[31mError:\x1b[0m boom'
    expect(stripAnsiForFailureDisplay(raw)).toContain('Error:')
    expect(stripAnsiForFailureDisplay(raw)).not.toContain('\x1b')
  })

  it('splits Call log from assertion head', () => {
    const raw = `Error: expect(locator).toBeVisible() failed

Locator: getByRole('button')
Expected: visible
Received: hidden

Call log:
  - waiting 5000ms
  - timeout`
    const { head, callLog } = splitPlaywrightFailureHeadAndCallLog(raw)
    expect(head).toContain('expect(locator)')
    expect(head).toContain('Received: hidden')
    expect(callLog).toContain('waiting 5000ms')
    const { summary, hasCallLog } = summarizePlaywrightFailureMessage(raw)
    expect(hasCallLog).toBe(true)
    expect(summary).toContain('Error:')
    expect(summary).not.toContain('waiting 5000ms')
    expect(summary).not.toContain('Received:')
  })

  it('parses Locator / Expected / Received blocks from head', () => {
    const head = `Error: x

Locator: getByRole('x')
Expected: visible
Received: hidden`
    const h = parseAssertionHintsFromPlaywrightHead(head)
    expect(h.locator).toContain("getByRole('x')")
    expect(h.expected).toBe('visible')
    expect(h.received).toBe('hidden')
  })

  it('merges matcherResult with message (message wins on conflicts)', () => {
    const raw = `Error: fail

Expected: from message
Received: from message

Call log:
x`
    const d = derivePlaywrightFailureDisplay(raw, { expected: 'mr', actual: 'actualOnly' })
    expect(d.assertionHints?.expected).toContain('from message')
    expect(d.assertionHints?.received).toContain('from message')
  })

  it('fills expected/received from matcher when missing in message', () => {
    const d = derivePlaywrightFailureDisplay('Error: boom', { expected: 1, actual: 2 })
    expect(d.assertionHints?.expected).toBe('1')
    expect(d.assertionHints?.received).toBe('2')
  })

  it('extracts last spec file location from stack', () => {
    const msg = `Error: fail

  at helper (node_modules/@playwright/test/lib/helper.ts:1:1)
  at tests/e2e/login.spec.ts:88:12`
    const loc = extractPlaywrightStackLocation(msg)
    expect(loc?.file).toContain('login.spec.ts')
    expect(loc?.line).toBe(88)
    expect(loc?.column).toBe(12)
  })
})
