/**
 * Find translation keys used in TSX/TS but missing in en/translation.json
 * Run: pnpm tsx scripts/find-missing-translation-keys.ts
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LOCALES_DIR = join(ROOT, 'src/renderer/locales')
const RENDERER_DIR = join(ROOT, 'src/renderer')

function getValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.')
  let o: unknown = obj
  for (const p of parts) {
    if (o && typeof o === 'object' && p in (o as object)) o = (o as Record<string, unknown>)[p]
    else return undefined
  }
  return o
}

function extractKeysFromCode(): Set<string> {
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
          // Only keys with dot (namespace.key) and exclude paths, escape seqs
          if (
            key.includes('.') &&
            !key.includes('{{') &&
            !key.includes('${') &&
            !key.startsWith('@/') &&
            !key.startsWith('./') &&
            !key.startsWith('../') &&
            !/^[\\\n\t|]+$/.test(key)
          ) {
            used.add(key)
          }
        }
      }
    }
  }
  scanDir(RENDERER_DIR)
  return used
}

function main() {
  const usedKeys = extractKeysFromCode()
  const enPath = join(LOCALES_DIR, 'en/translation.json')
  const en = JSON.parse(readFileSync(enPath, 'utf-8')) as Record<string, unknown>

  const missing: string[] = []
  for (const key of [...usedKeys].sort()) {
    const v = getValue(en, key)
    if (v === undefined) missing.push(key)
  }

  console.log('=== Translation keys used in code but MISSING in en/translation.json ===\n')
  console.log(`Total missing: ${missing.length}\n`)
  for (const k of missing) {
    console.log(k)
  }
}

main()
