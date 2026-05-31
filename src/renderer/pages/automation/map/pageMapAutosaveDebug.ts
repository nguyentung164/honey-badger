const PREFIX = '[PageMapAutosave]'

let seq = 0

function nextId(): string {
  seq += 1
  return `#${seq}`
}

/** Dev-only tracing for page map autosave / drag persist (filter console by "PageMapAutosave"). */
export function logPageMapAutosave(event: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  const payload = { t: performance.now().toFixed(1), ...detail }
  console.info(PREFIX, event, payload)
}

export function logPageMapAutosaveBatch(
  kind: 'persist' | 'persistAll',
  label: string,
  detail?: Record<string, unknown>,
): { batchId: string; done: (extra?: Record<string, unknown>) => void } {
  const batchId = nextId()
  logPageMapAutosave(`${kind}:start`, { batchId, label, ...detail })
  return {
    batchId,
    done: extra => logPageMapAutosave(`${kind}:done`, { batchId, label, ...extra }),
  }
}
