#!/usr/bin/env node
/**
 * Installs app dependencies for electron-builder packaging.
 *
 * On Windows, node-pty@1.x ships N-API prebuilds (prebuilds/win32-x64) that work
 * across Electron versions — no MSVC / @electron/rebuild needed (see beforeBuild.cjs).
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(projectRoot, 'node_modules', '.dev')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  })
}

if (process.platform === 'win32') {
  console.log(
    '[install:deps] Windows — installing app deps without native rebuild (node-pty prebuilds)',
  )
  const result = run('pnpm', ['install'], { cwd: appDir })
  process.exit(result.status ?? 1)
}

const result = run('pnpm', ['electron-builder', 'install-app-deps'], { cwd: projectRoot })
process.exit(result.status ?? 0)
