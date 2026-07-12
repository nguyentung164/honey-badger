#!/usr/bin/env node
/**
 * Installs app dependencies for electron-builder packaging.
 *
 * On Windows, node-pty@1.x ships N-API prebuilds (prebuilds/win32-x64) that work
 * across Electron versions — no MSVC / @electron/rebuild needed (see beforeBuild.cjs).
 * pnpm install inside node_modules/.dev is a no-op (workspace root), so we junction-link
 * root node_modules into the app dir and run node-pty's post-install for conpty binaries.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(projectRoot, 'node_modules', '.dev')
const rootNodeModules = join(projectRoot, 'node_modules')
const appNodeModules = join(appDir, 'node_modules')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  })
}

function removePath(path) {
  if (!existsSync(path)) {
    return
  }
  const stat = lstatSync(path)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    rmSync(path, { recursive: true, force: true })
    return
  }
  rmSync(path, { force: true })
}

function linkAppNodeModules() {
  removePath(appNodeModules)
  mkdirSync(appDir, { recursive: true })

  if (process.platform === 'win32') {
    const result = run('cmd', ['/c', 'mklink', '/J', appNodeModules, rootNodeModules])
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
    return
  }

  const result = run('ln', ['-sfn', rootNodeModules, appNodeModules])
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function collectNodePtyDirs() {
  const dirs = new Set()
  const hoisted = join(rootNodeModules, 'node-pty')
  if (existsSync(join(hoisted, 'scripts', 'post-install.js'))) {
    dirs.add(hoisted)
  }

  const pnpmDir = join(rootNodeModules, '.pnpm')
  if (!existsSync(pnpmDir)) {
    return [...dirs]
  }

  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith('node-pty@')) {
      continue
    }
    const ptyDir = join(pnpmDir, entry, 'node_modules', 'node-pty')
    if (existsSync(join(ptyDir, 'scripts', 'post-install.js'))) {
      dirs.add(ptyDir)
    }
  }

  return [...dirs]
}

function runNodePtyPostInstall() {
  for (const ptyDir of collectNodePtyDirs()) {
    console.log(`[install:deps] node-pty post-install: ${ptyDir}`)
    const result = run('node', ['scripts/post-install.js'], { cwd: ptyDir })
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

if (process.platform === 'win32') {
  console.log('[install:deps] Windows — link root node_modules into app dir')
  linkAppNodeModules()
  runNodePtyPostInstall()
  process.exit(0)
}

const result = run('pnpm', ['electron-builder', 'install-app-deps'], { cwd: projectRoot })
process.exit(result.status ?? 0)
