import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/vscode-material-icons/generated/icons')
const destination = resolve(root, 'src/resources/public/material-icons')

if (!existsSync(source)) {
  console.warn('[copy-material-icons] Skip: vscode-material-icons icons not installed yet.')
  process.exit(0)
}

mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true, force: true })
console.log(`[copy-material-icons] Copied icons to ${destination}`)
