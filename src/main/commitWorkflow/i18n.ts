import appearanceStore from '../store/AppearanceStore'

type Lang = 'en' | 'vi' | 'ja'

const messages = {
  failTitle: {
    en: 'Commit workflow failed',
    vi: 'Workflow commit thất bại',
    ja: 'コミットワークフロー失敗',
  },
  failBody: {
    en: 'Commit {{hash}} did not pass all quality checks. Open Commit Quality dashboard for details.',
    vi: 'Commit {{hash}} không vượt qua kiểm tra chất lượng. Mở bảng Commit Quality để xem chi tiết.',
    ja: 'コミット {{hash}} は品質チェックに合格しませんでした。Commit Quality ダッシュボードで詳細を確認してください。',
  },
} as const

function currentLang(): Lang {
  const lang = appearanceStore.get('language')
  if (lang === 'vi' || lang === 'ja') return lang
  return 'en'
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function tCommitWorkflow(key: keyof typeof messages, vars?: Record<string, string>): string {
  const lang = currentLang()
  const raw = messages[key][lang]
  return vars ? interpolate(raw, vars) : raw
}
