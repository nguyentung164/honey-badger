/** Tiêu đề mẫu: #123456-AME-XXX (2) (main) — mã + max (n) trong commit + tên base. */
/** Cho phép dạng mở rộng: #128246-AME-561_AME-563 (1) (không chỉ 2 segment sau mã số). */
const ISSUE_VERSION_RE = /(#(?:[0-9]+-[-A-Za-z0-9_]+))\s*\((\d+)\)/g
const BRANCH_ISSUE_RE = /#?([0-9]+-[-A-Za-z0-9_]+)/i

function stripIssueHash(key: string): string {
  return key.replace(/^#/, '').toLowerCase()
}

/** Mỗi mã #… gán max(n) từ mọi dòng message. */
export function maxIssueVersionByKey(messages: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const msg of messages) {
    for (const line of msg.split(/\r?\n/)) {
      for (const m of line.matchAll(new RegExp(ISSUE_VERSION_RE.source, 'g'))) {
        const key = m[1]
        const n = parseInt(m[2], 10)
        if (!Number.isNaN(n) && n >= 0) {
          map.set(key, Math.max(map.get(key) ?? 0, n))
        }
      }
    }
  }
  return map
}

function parseBranchIssueKey(headBranch: string): string | null {
  const head = headBranch.trim()
  const m = head.match(BRANCH_ISSUE_RE)
  if (!m) return null
  return m[0].startsWith('#') ? m[0] : `#${m[1]}`
}

/** Bản tối đa từ map cho … hoặc mọi mã prefix (cũ) khớp với mã từ tên nhánh. */
function versionForKeyOrPrefix(byKey: Map<string, number>, keyWithHash: string): number {
  const exact = byKey.get(keyWithHash)
  if (exact !== undefined) return exact

  const full = stripIssueHash(keyWithHash)
  let best = 0
  for (const [k, v] of byKey) {
    if (full.startsWith(stripIssueHash(k)) || stripIssueHash(k).startsWith(full)) {
      best = Math.max(best, v)
    }
  }
  return best > 0 ? best : 1
}

function firstMatchInNewestOnly(messages: string[], re: RegExp): { key: string; version: number } | null {
  if (messages.length === 0) return null
  const only = [messages[0]]
  return pickFromMessagesOnly(only, re)
}

function pickFromMessagesOnly(messages: string[], re: RegExp): { key: string; version: number } | null {
  for (const msg of messages) {
    for (const line of msg.split(/\r?\n/)) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (m) {
        return { key: m[1], version: parseInt(m[2], 10) }
      }
    }
  }
  return null
}

/**
 * Ưu tiên: mã từ tên head (dài nhất) + bản lớn nhất từ commit khớp prefix;
 * tiếp theo: mã từ commit mới nhất (message đầu) nếu head không suy ra được mã;
 * không dùng max(n) trên mọi mã trong 500+ commit lịch sử (dễ dính mã từ main/merge cũ).
 */
export function pickIssueKeyAndVersion(
  messages: string[],
  headBranch: string
): { key: string; version: number } | null {
  const byKey = maxIssueVersionByKey(messages)
  const head = headBranch.trim()
  const headLower = head.toLowerCase()
  const branchKey = parseBranchIssueKey(head)

  if (branchKey) {
    const version = byKey.size > 0 ? versionForKeyOrPrefix(byKey, branchKey) : 1
    return { key: branchKey, version }
  }

  if (byKey.size > 0) {
    const keysSorted = [...byKey.keys()].sort(
      (a, b) => stripIssueHash(b).length - stripIssueHash(a).length
    )
    for (const key of keysSorted) {
      const slug = stripIssueHash(key)
      const v = byKey.get(key)
      if (v !== undefined && headLower.includes(slug)) {
        return { key, version: v }
      }
    }
  }

  const fromTip = firstMatchInNewestOnly(messages, new RegExp(ISSUE_VERSION_RE.source, 'g'))
  if (fromTip) return fromTip

  return null
}

export function buildIssueStylePrTitle(key: string, version: number, baseBranch: string): string {
  const base = baseBranch.trim()
  return `${key} (${version}) (${base})`
}
