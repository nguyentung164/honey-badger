/**
 * Validate commit message theo Conventional Commits 1.0.0 (frontend, regex only).
 * Spec: https://www.conventionalcommits.org/en/v1.0.0/
 */

export interface CommitLintResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** Các type chuẩn (Angular / @commitlint/config-conventional) */
const CONVENTIONAL_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'] as const

/**
 * Regex cộng đồng (marcojahn gist) - validate theo Conventional Commits spec:
 * type(scope)?!?: subject
 * https://gist.github.com/marcojahn/482410b728c31b221b70ea6d2c433f0c
 */
const HEADER_REGEX = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test){1}(\([\w\-./]+\))?(!)?: ([\w ])+([\s\S]*)/

export function validateCommitMessage(message: string): CommitLintResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = message?.trim() ?? ''
  if (trimmed.length === 0) {
    return {
      valid: false,
      errors: ['Commit message cannot be empty'],
      warnings: [],
    }
  }

  const firstLine = trimmed.split('\n')[0]

  if (!HEADER_REGEX.test(firstLine)) {
    errors.push(`Commit message must follow format: type(scope): subject (e.g. feat(api): add endpoint). Valid types: ${CONVENTIONAL_TYPES.join(', ')}`)
  }

  const subjectMatch = firstLine.match(/^[^:]+:\s*(.+)$/)
  if (subjectMatch?.[1].trim().endsWith('.')) {
    warnings.push('Subject should not end with a period')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
