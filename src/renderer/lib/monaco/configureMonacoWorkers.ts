const workerCache = new Map<string, Worker>()

function getOrCreateWorker(key: string, factory: () => Worker): Worker {
  const existing = workerCache.get(key)
  if (existing) return existing
  const worker = factory()
  workerCache.set(key, worker)
  return worker
}

function editorWorker(): Worker {
  return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
}

function typescriptWorker(): Worker {
  return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
}

/** @deprecated Always-on; kept for Diff Viewer beforeMount compatibility. */
export function enableMonacoTypeScriptWorker(): void {
  // no-op — ts.worker is always used (cached singleton).
}

/** @deprecated Always true; kept for editor options compatibility. */
export function isMonacoTypeScriptWorkerEnabled(): boolean {
  return true
}

/** Bundle Monaco language workers locally (VS Code pattern — no CDN). */
export function configureMonacoWorkers(): void {
  if (typeof globalThis === 'undefined') return
  const g = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker }
  }
  if (g.MonacoEnvironment?.getWorker) return

  g.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'json') {
        return getOrCreateWorker('json', () => new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' }))
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return getOrCreateWorker('css', () => new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' }))
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return getOrCreateWorker('html', () => new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' }))
      }
      if (label === 'typescript' || label === 'javascript') {
        return getOrCreateWorker('typescript', typescriptWorker)
      }
      return getOrCreateWorker('editor', editorWorker)
    },
  }
}
