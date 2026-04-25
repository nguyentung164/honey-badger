/**
 * Script to find unused translation keys in the project.
 * Excludes spotbugs.bugDescriptions.* from analysis.
 * Run: pnpm tsx scripts/find-unused-translation-keys.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOCALES_DIR = join(ROOT, 'src/renderer/locales')
const RENDERER_DIR = join(ROOT, 'src/renderer')

function flattenKeys(obj: Record<string, unknown>, prefix = '', excludePrefix?: string): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (excludePrefix && fullKey.startsWith(excludePrefix)) continue
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flattenKeys(value as Record<string, unknown>, fullKey, excludePrefix)) {
        keys.add(k)
      }
    } else {
      keys.add(fullKey)
    }
  }
  return keys
}

function getAllTranslationKeys(): Set<string> {
  const enPath = join(LOCALES_DIR, 'en/translation.json')
  const en = JSON.parse(readFileSync(enPath, 'utf-8')) as Record<string, unknown>
  return flattenKeys(en, '', 'spotbugs.bugDescriptions')
}

function extractStaticKeysFromCode(): Set<string> {
  const used = new Set<string>()
  const staticPattern = /t\s*\(\s*['"`]([^'"`]+)['"`]/g

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') scanDir(fullPath)
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = readFileSync(fullPath, 'utf-8')
        let m: RegExpExecArray | null
        while ((m = staticPattern.exec(content)) !== null) {
          const key = m[1]
          if (!key.includes('{{') && !key.includes('${')) used.add(key)
        }
      }
    }
  }
  scanDir(RENDERER_DIR)
  return used
}

function getKeysFromConstants(): Set<string> {
  const used = new Set<string>()
  const constantsPath = join(RENDERER_DIR, 'components/shared/constants.ts')
  const content = readFileSync(constantsPath, 'utf-8')

  const relevantExports = [
    'STATUS_TEXT',
    'SVN_UPDATE_STATUS_TEXT',
    'GIT_STATUS_TEXT',
    'MERGE_STATUS_TEXT',
    'CATEGORY_DESCRIPTIONS',
  ]

  for (const exportName of relevantExports) {
    const exportRegex = new RegExp(
      `export const ${exportName}[^=]*=\\s*\\{([^}]+)\\}`,
      's'
    )
    const match = content.match(exportRegex)
    if (match) {
      const block = match[1]
      const re = /:\s*['"`]([a-zA-Z0-9_.]+)['"`]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(block)) !== null) {
        used.add(m[1])
      }
    }
  }

  return used
}

function extractKeysFromObjectLiterals(): Set<string> {
  const used = new Set<string>()
  const keyPattern = /['"`]([a-z][a-z0-9_.]*\.[a-z0-9_.]+)['"`]/g

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') scanDir(fullPath)
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = readFileSync(fullPath, 'utf-8')
        let m: RegExpExecArray | null
        while ((m = keyPattern.exec(content)) !== null) {
          const k = m[1]
          if (!k.startsWith('spotbugs.bugDescriptions')) used.add(k)
        }
      }
    }
  }
  scanDir(RENDERER_DIR)
  return used
}

function getDynamicKeys(): Set<string> {
  return new Set([
    'taskManagement.statusNew',
    'taskManagement.statusInProgress',
    'taskManagement.statusInReview',
    'taskManagement.statusFixed',
    'taskManagement.statusFeedback',
    'taskManagement.statusDone',
    'taskManagement.statusCancelled',
    'taskManagement.priorityCritical',
    'taskManagement.priorityHigh',
    'taskManagement.priorityMedium',
    'taskManagement.priorityLow',
    'dashboard.filterAll',
    'dashboard.filterGit',
    'dashboard.filterSvn',
    'settings.fontSize.small',
    'settings.fontSize.medium',
    'settings.fontSize.large',
    'table.filter.nonVersioned',
    'table.filter.versioned',
    'table.filter.added',
    'table.filter.deleted',
    'table.filter.modified',
    'table.filter.files',
    'table.filter.directories',
  ])
}

function main() {
  const allKeys = getAllTranslationKeys()
  const staticUsed = extractStaticKeysFromCode()
  const constantsUsed = getKeysFromConstants()
  const dynamicUsed = getDynamicKeys()

  const objectLiteralKeys = extractKeysFromObjectLiterals()
  const usedKeys = new Set<string>([
    ...staticUsed,
    ...constantsUsed,
    ...dynamicUsed,
    ...objectLiteralKeys,
  ])

  const unusedKeys: string[] = []
  for (const key of allKeys) {
    if (usedKeys.has(key)) continue
    const isPrefixOfUsed = [...usedKeys].some((u) => u.startsWith(key + '.'))
    if (isPrefixOfUsed) continue
    unusedKeys.push(key)
  }

  unusedKeys.sort()

  console.log('=== Unused translation keys (excluding spotbugs.bugDescriptions) ===\n')
  console.log(`Total: ${unusedKeys.length}\n`)
  for (const k of unusedKeys) {
    console.log(k)
  }

  const outPath = join(ROOT, 'unused-translation-keys.txt')
  writeFileSync(outPath, unusedKeys.join('\n'), 'utf-8')
  console.log(`\nWritten to ${outPath}`)
}

main()
