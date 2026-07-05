import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Keep in sync with SARASA_MONO_BUNDLED_FONT_FAMILY in src/renderer/lib/terminal/terminalPrefs.ts */
const BUNDLED_FONT_FAMILY = 'HB Sarasa Mono SC Subset'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(root, 'node_modules/sarasa-mono-web/fonts/SarasaMonoCL-Regular')
const sourceCss = resolve(sourceDir, 'SarasaMonoCL-Regular.css')
const destDir = resolve(root, 'src/resources/public/fonts/sarasa-mono-sc')
const destCss = resolve(destDir, 'sarasa-mono-sc.css')

if (!existsSync(sourceDir) || !existsSync(sourceCss)) {
  console.warn('[copy-sarasa-fonts] Skip: sarasa-mono-web fonts not installed yet.')
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })

for (const name of readdirSync(sourceDir)) {
  if (!name.endsWith('.woff2')) continue
  cpSync(resolve(sourceDir, name), resolve(destDir, name), { force: true })
}

// Isolated family name so OS-installed Sarasa Mono J/SC/K/… keep full weight matching.
const css = readFileSync(sourceCss, 'utf8').replace(
  /font-family:\s*SarasaMonoCL-Regular/g,
  `font-family: "${BUNDLED_FONT_FAMILY}"`
)

writeFileSync(destCss, css)

console.log(`[copy-sarasa-fonts] Copied Sarasa Mono SC subset to ${destDir}`)
