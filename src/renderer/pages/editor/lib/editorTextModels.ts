/**
 * VS Code pattern: text lives in Monaco ITextModel (keyed by URI), not in React/Zustand.
 * This registry only tracks baselines for dirty detection and reload coordination.
 */
type ModelRecord = {
  relativePath: string
  baseline: string
  diskRevision: number
  /** Monaco getAlternativeVersionId() at last disk load / save — O(1) dirty check. */
  baselineAlternativeVersionId: number | null
  diskMtimeMs: number | null
}

const models = new Map<string, ModelRecord>()

export function modelKey(repoCwd: string, relativePath: string): string {
  return `${repoCwd}::${relativePath.replace(/\\/g, '/')}`
}

export function registerModelBaseline(
  repoCwd: string,
  relativePath: string,
  baseline: string,
  diskMtimeMs?: number | null
): number {
  const key = modelKey(repoCwd, relativePath)
  const prev = models.get(key)
  const diskRevision = (prev?.diskRevision ?? 0) + 1
  models.set(key, {
    relativePath: relativePath.replace(/\\/g, '/'),
    baseline: baseline.replace(/\r\n/g, '\n'),
    diskRevision,
    baselineAlternativeVersionId: prev?.baselineAlternativeVersionId ?? null,
    diskMtimeMs: diskMtimeMs ?? prev?.diskMtimeMs ?? null,
  })
  return diskRevision
}

export function setModelBaselineVersion(repoCwd: string, relativePath: string, alternativeVersionId: number): void {
  const key = modelKey(repoCwd, relativePath)
  const rec = models.get(key)
  if (rec) {
    rec.baselineAlternativeVersionId = alternativeVersionId
  } else {
    models.set(key, {
      relativePath: relativePath.replace(/\\/g, '/'),
      baseline: '',
      diskRevision: 1,
      baselineAlternativeVersionId: alternativeVersionId,
      diskMtimeMs: null,
    })
  }
}

export function getModelDiskRevision(repoCwd: string, relativePath: string): number {
  return models.get(modelKey(repoCwd, relativePath))?.diskRevision ?? 0
}

export function getModelDiskMtimeMs(repoCwd: string, relativePath: string): number | null {
  return models.get(modelKey(repoCwd, relativePath))?.diskMtimeMs ?? null
}

export function getModelBaseline(repoCwd: string, relativePath: string): string {
  return models.get(modelKey(repoCwd, relativePath))?.baseline ?? ''
}

export function isDirtyByVersion(repoCwd: string, relativePath: string, alternativeVersionId: number): boolean {
  const rec = models.get(modelKey(repoCwd, relativePath))
  if (!rec || rec.baselineAlternativeVersionId == null) return false
  return alternativeVersionId !== rec.baselineAlternativeVersionId
}

/** @deprecated Prefer isDirtyByVersion for hot paths. */
export function isDirtyAgainstBaseline(repoCwd: string, relativePath: string, live: string): boolean {
  const baseline = getModelBaseline(repoCwd, relativePath)
  return live.replace(/\r\n/g, '\n') !== baseline
}

/** Force dirty indicator when buffer diverged from disk but user chose to keep local. */
export function forceBufferDirtyState(repoCwd: string, relativePath: string, alternativeVersionId: number | null): void {
  if (alternativeVersionId == null) return
  setModelBaselineVersion(repoCwd, relativePath, alternativeVersionId - 1)
}

export function commitModelBaseline(
  repoCwd: string,
  relativePath: string,
  content: string,
  alternativeVersionId?: number | null,
  diskMtimeMs?: number | null
): void {
  const key = modelKey(repoCwd, relativePath)
  const rec = models.get(key)
  const normalized = content.replace(/\r\n/g, '\n')
  if (rec) {
    rec.baseline = normalized
    if (alternativeVersionId != null) rec.baselineAlternativeVersionId = alternativeVersionId
    if (diskMtimeMs != null) rec.diskMtimeMs = diskMtimeMs
  } else {
    models.set(key, {
      relativePath,
      baseline: normalized,
      diskRevision: 1,
      baselineAlternativeVersionId: alternativeVersionId ?? null,
      diskMtimeMs: diskMtimeMs ?? null,
    })
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
