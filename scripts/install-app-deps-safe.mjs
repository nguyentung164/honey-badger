#!/usr/bin/env node
/**
 * Runs electron-builder install-app-deps. On Windows, node-pty ships N-API prebuilds
 * (prebuilds/win32-x64) that work across Electron versions — no MSVC compile needed.
 * If rebuild fails (no Visual Studio Build Tools), continue so install/postinstall succeeds.
 */
import { spawnSync } from 'node:child_process'

const result = spawnSync('pnpm', ['electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

if (result.status === 0) {
  process.exit(0)
}

if (process.platform === 'win32') {
  console.warn(
    '\n[install:deps] electron-builder install-app-deps failed on Windows — continuing with node-pty N-API prebuilds (no MSVC required).\n'
  )
  process.exit(0)
}

process.exit(result.status ?? 1)
