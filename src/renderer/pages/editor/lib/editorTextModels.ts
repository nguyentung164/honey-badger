/**
 * VS Code pattern: text lives in Monaco ITextModel (keyed by URI), not in React/Zustand.
 * This registry only tracks baselines for dirty detection and reload coordination.
 */
type ModelRecord = {
  relativePath: string
  baseline: string
  diskRevision: number
}

const models = new Map<string, ModelRecord>()

export function modelKey(repoCwd: string, relativePath: string): string {
  return `${repoCwd}::${relativePath.replace(/\\/g, '/')}`
}

export function registerModelBaseline(repoCwd: string, relativePath: string, baseline: string): number {
  const key = modelKey(repoCwd, relativePath)
  const prev = models.get(key)
  const diskRevision = (prev?.diskRevision ?? 0) + 1
  models.set(key, {
    relativePath: relativePath.replace(/\\/g, '/'),
    baseline: baseline.replace(/\r\n/g, '\n'),
    diskRevision,
  })
  return diskRevision
}

export function getModelDiskRevision(repoCwd: string, relativePath: string): number {
  return models.get(modelKey(repoCwd, relativePath))?.diskRevision ?? 0
}

export function getModelBaseline(repoCwd: string, relativePath: string): string {
  return models.get(modelKey(repoCwd, relativePath))?.baseline ?? ''
}

export function isDirtyAgainstBaseline(repoCwd: string, relativePath: string, live: string): boolean {
  const baseline = getModelBaseline(repoCwd, relativePath)
  return live.replace(/\r\n/g, '\n') !== baseline
}

export function commitModelBaseline(repoCwd: string, relativePath: string, content: string): void {
  const key = modelKey(repoCwd, relativePath)
  const rec = models.get(key)
  const normalized = content.replace(/\r\n/g, '\n')
  if (rec) {
    rec.baseline = normalized
  } else {
    models.set(key, { relativePath, baseline: normalized, diskRevision: 1 })
  }
}

export function unregisterModel(repoCwd: string, relativePath: string): void {
  models.delete(modelKey(repoCwd, relativePath))
}

export function renameModelPath(repoCwd: string, fromPath: string, toPath: string): void {
  const fromKey = modelKey(repoCwd, fromPath)
  const toKey = modelKey(repoCwd, toPath)
  const rec = models.get(fromKey)
  if (!rec) return
  models.delete(fromKey)
  models.set(toKey, { ...rec, relativePath: toPath.replace(/\\/g, '/') })
}
