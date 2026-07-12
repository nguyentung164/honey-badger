import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const SCRIPT_NAME = 'shellIntegration.ps1'

function scriptCandidates(): string[] {
  const candidates = [
    path.join(process.resourcesPath, 'terminal-scripts', SCRIPT_NAME),
    path.join(process.cwd(), 'src/main/terminal/scripts', SCRIPT_NAME),
  ]

  if (!app.isPackaged) {
    candidates.push(path.join(app.getAppPath(), 'src/main/terminal/scripts', SCRIPT_NAME))
    // electron-vite dev: main bundle lives in node_modules/.dev/main
    candidates.push(path.normalize(path.join(__dirname, '../../../src/main/terminal/scripts', SCRIPT_NAME)))
  }

  return candidates
}

/** VS Code-aligned script path — dev: source tree; packaged: extraResources. */
export function resolveShellIntegrationPs1Path(): string {
  for (const candidate of scriptCandidates()) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(`Shell integration script not found: ${SCRIPT_NAME} (searched: ${scriptCandidates().join(', ')})`)
}
