import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const nodeRequire = createRequire(import.meta.url)

export function buildLanguageServerSpawnEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (command !== process.execPath) return env

  env.ELECTRON_RUN_AS_NODE = '1'
  const nodePathRoots: string[] = []
  try {
    const pkgJson = nodeRequire.resolve('typescript-language-server/package.json')
    nodePathRoots.push(path.join(path.dirname(pkgJson), '..'))
  } catch {
    /* ignore */
  }
  const appPath = app.getAppPath()
  for (const root of [
    path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'node_modules'),
    path.join(appPath, 'node_modules'),
    path.join(process.cwd(), 'node_modules'),
  ]) {
    if (fs.existsSync(root)) nodePathRoots.push(root)
  }
  if (nodePathRoots.length > 0) {
    env.NODE_PATH = [...new Set(nodePathRoots)].join(path.delimiter)
  }
  return env
}

export function resolveTypeScriptLanguageServer(): { command: string; args: string[] } {
  const candidates: string[] = []

  try {
    const pkgJson = nodeRequire.resolve('typescript-language-server/package.json')
    candidates.push(path.join(path.dirname(pkgJson), 'lib', 'cli.mjs'))
  } catch {
    /* package not resolved */
  }

  const binName = process.platform === 'win32' ? 'typescript-language-server.cmd' : 'typescript-language-server'
  const searchRoots = [
    process.cwd(),
    app.getAppPath(),
    app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
    path.join(app.getAppPath(), '..'),
  ]

  for (const root of searchRoots) {
    candidates.push(path.join(root, 'node_modules', '.bin', binName))
    candidates.push(path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'))
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      if (candidate.endsWith('.mjs') || candidate.endsWith('.js')) {
        return { command: process.execPath, args: [candidate, '--stdio'] }
      }
      return { command: candidate, args: ['--stdio'] }
    }
  }

  return { command: binName, args: ['--stdio'] }
}
