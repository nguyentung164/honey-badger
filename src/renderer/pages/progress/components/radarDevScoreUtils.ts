import {
  RADAR_METRIC_ORDER,
  type RadarProfileMetricKey,
  type RadarProfileScores,
} from './radarProfileInsights'

export function computeDevScoreOrdered(scores: RadarProfileScores): number {
  const sum = RADAR_METRIC_ORDER.reduce((s, k) => s + scores[k], 0)
  return Math.round(sum / RADAR_METRIC_ORDER.length)
}

export function getDevScoreGrade(score: number): {
  gradeKey: string
  color: string
  bg: string
  ring: string
} {
  if (score >= 85)
    return {
      gradeKey: 'progress.devScoreGrade.excellent',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.08)',
      ring: 'rgba(34,197,94,0.22)',
    }
  if (score >= 75)
    return {
      gradeKey: 'progress.devScoreGrade.good',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.08)',
      ring: 'rgba(59,130,246,0.22)',
    }
  if (score >= 60)
    return {
      gradeKey: 'progress.devScoreGrade.average',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.08)',
      ring: 'rgba(245,158,11,0.22)',
    }
  if (score >= 40)
    return {
      gradeKey: 'progress.devScoreGrade.needsWork',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.08)',
      ring: 'rgba(249,115,22,0.22)',
    }
  return {
    gradeKey: 'progress.devScoreGrade.poor',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    ring: 'rgba(239,68,68,0.22)',
  }
}

export function radarMetricLabel(t: (key: string) => string, key: RadarProfileMetricKey): string {
  return t(`progress.metricLabel.${key}`)
}
