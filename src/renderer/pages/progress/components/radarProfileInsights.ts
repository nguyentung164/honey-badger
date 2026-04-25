/**
 * Heuristic "shape" labels for radar scores — coaching hints, not job ratings.
 */

export type RadarProfileMetricKey =
  | 'velocity'
  | 'quality'
  | 'reliability'
  | 'delivery'
  | 'collaboration'
  | 'impact'

/** Same shape as computeRadarScores() result */
export type RadarProfileScores = Record<RadarProfileMetricKey, number>

/** Fixed iteration order for averages, tie-breaks, and UI. */
export const RADAR_METRIC_ORDER: RadarProfileMetricKey[] = [
  'velocity',
  'quality',
  'reliability',
  'delivery',
  'collaboration',
  'impact',
]

/** If max(score) − min(score) ≤ this, treat as a balanced radar */
export const BALANCED_SPREAD_MAX = 15

export interface RadarProfileSummary {
  strengthKey: RadarProfileMetricKey
  weakKey: RadarProfileMetricKey
  /** i18n key under progress.* */
  shapeI18nKey: string
  balanced: boolean
}

/**
 * Tie-break: uses strict `>` only, so when multiple axes share the max score,
 * the first axis in RADAR_METRIC_ORDER wins (same for min with `<`).
 */
function pickStrengthKey(scores: RadarProfileScores): RadarProfileMetricKey {
  let best: RadarProfileMetricKey = 'velocity'
  let bestV = scores.velocity
  for (const k of RADAR_METRIC_ORDER) {
    if (scores[k] > bestV) {
      bestV = scores[k]
      best = k
    }
  }
  return best
}

function pickWeakKey(scores: RadarProfileScores): RadarProfileMetricKey {
  let worst: RadarProfileMetricKey = 'velocity'
  let worstV = scores.velocity
  for (const k of RADAR_METRIC_ORDER) {
    if (scores[k] < worstV) {
      worstV = scores[k]
      worst = k
    }
  }
  return worst
}

/**
 * Derive strength / weak axis and a coarse profile shape label (i18n key).
 */
export function getRadarProfileSummary(scores: RadarProfileScores): RadarProfileSummary {
  const strengthKey = pickStrengthKey(scores)
  const weakKey = pickWeakKey(scores)
  const vals = RADAR_METRIC_ORDER.map(k => scores[k])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const spread = max - min
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length

  if (spread <= BALANCED_SPREAD_MAX) {
    return {
      strengthKey,
      weakKey,
      shapeI18nKey: 'progress.profileShapeBalanced',
      balanced: true,
    }
  }

  if (strengthKey === 'quality' && scores.quality >= mean + 10) {
    return {
      strengthKey,
      weakKey,
      shapeI18nKey: 'progress.profileShapeCraftsman',
      balanced: false,
    }
  }

  if (strengthKey === 'collaboration') {
    return {
      strengthKey,
      weakKey,
      shapeI18nKey: 'progress.profileShapeTeamPlayer',
      balanced: false,
    }
  }

  const sorted = [...RADAR_METRIC_ORDER].sort((a, b) => {
    const d = scores[b] - scores[a]
    if (d !== 0) return d
    return RADAR_METRIC_ORDER.indexOf(a) - RADAR_METRIC_ORDER.indexOf(b)
  })
  const top2 = new Set<RadarProfileMetricKey>([sorted[0], sorted[1]])
  if (top2.has('velocity') && top2.has('impact')) {
    return {
      strengthKey,
      weakKey,
      shapeI18nKey: 'progress.profileShapeExecutionHeavy',
      balanced: false,
    }
  }

  return {
    strengthKey,
    weakKey,
    shapeI18nKey: 'progress.profileShapeMixed',
    balanced: false,
  }
}
