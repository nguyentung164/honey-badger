import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const nodeRequire = createRequire(import.meta.url)

export type TypeScriptServerBackend = 'typescript-language-server' | 'typescript-native'

export type TypeScriptLanguageServerSpawn = {
  command: string
  args: string[]
  backend: TypeScriptServerBackend
}

export function resolveWorkspaceTsserverPath(rootPath: string): string | undefined {
  const tsserver = path.join(rootPath, 'node_modules', 'typescript', 'lib', 'tsserver.js')
  return fs.existsSync(tsserver) ? tsserver : undefined
}

export function usesNativeTypeScriptLsp(rootPath: string): boolean {
  const tscEntry = path.join(rootPath, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(tscEntry)) return false
  return resolveWorkspaceTsserverPath(rootPath) === undefined
}

/** TypeScript 7+ ships a native platform binary; spawn it directly for LSP stdio pipes. */
export function resolveNativeTypeScriptExecutable(rootPath: string): string | undefined {
  const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`
  const exeName = process.platform === 'win32' ? 'tsc.exe' : 'tsc'
  const workspaceExe = path.join(rootPath, 'node_modules', platformPackage, 'lib', exeName)
  if (fs.existsSync(workspaceExe)) return workspaceExe
  try {
    const pkgJson = nodeRequire.resolve(`${platformPackage}/package.json`)
    const exe = path.join(path.dirname(pkgJson), 'lib', exeName)
    if (fs.existsSync(exe)) return exe
  } catch {
    /* package not resolved */
  }
  return undefined
}

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

export function resolveTypeScriptLanguageServer(rootPath: string): TypeScriptLanguageServerSpawn {
  if (usesNativeTypeScriptLsp(rootPath)) {
    const nativeExe = resolveNativeTypeScriptExecutable(rootPath)
    if (nativeExe) {
      return {
        command: nativeExe,
        args: ['--lsp', '--stdio'],
        backend: 'typescript-native',
      }
    }
    const tscEntry = path.join(rootPath, 'node_modules', 'typescript', 'bin', 'tsc')
    return {
      command: process.execPath,
      args: [tscEntry, '--lsp', '--stdio'],
      backend: 'typescript-native',
    }
  }

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
        return { command: process.execPath, args: [candidate, '--stdio'], backend: 'typescript-language-server' }
      }
      return { command: candidate, args: ['--stdio'], backend: 'typescript-language-server' }
    }
  }

  return { command: binName, args: ['--stdio'], backend: 'typescript-language-server' }
}
