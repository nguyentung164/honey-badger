let monacoTypeScriptWorkerEnabled = false

/** Enable the heavy ts.worker after LSP is active or for non-LSP JS/TS files. */
export function enableMonacoTypeScriptWorker(): void {
  monacoTypeScriptWorkerEnabled = true
}

function editorWorker(): Worker {
  return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
}

function typescriptWorker(): Worker {
  return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
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
        return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' })
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' })
      }
      if (label === 'typescript' || label === 'javascript') {
        return monacoTypeScriptWorkerEnabled ? typescriptWorker() : editorWorker()
      }
      return editorWorker()
    },
  }
}