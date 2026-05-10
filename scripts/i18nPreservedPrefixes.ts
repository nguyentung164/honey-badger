/**
 * Translation key path prefixes that static analysis cannot detect
 * (template literals, t(dynamicKey), camelCase regex gaps in object literals).
 * Used by find-unused-translation-keys.ts and remove-unused-translation-keys.ts.
 */
export const I18N_PRESERVED_PREFIXES = [
  'achievement.def.',
  'aiUsage.featureLabels.',
  'aiUsage.providerLabels.',
  'prManager.ghStatus.',
  'prManager.detail.confirm.',
  'prManager.bulk.',
  'prManager.mergePr.method.',
  'prManager.operationLog.',
  'teamProgress.dow.',
  'taskManagement.historyField.',
  'taskManagement.historySource_',
  'taskManagement.linkType.',
  'progress.metricLabel.',
  'progress.devScoreGrade.',
  'progress.profileShape',
  'progress.radar',
] as const

export function isPreservedI18nKey(key: string): boolean {
  const k = key.trim()
  if (!k || k.endsWith('.')) return true
  return I18N_PRESERVED_PREFIXES.some(p => k === p || k.startsWith(p))
}
