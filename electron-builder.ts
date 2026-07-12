import type { Configuration } from 'electron-builder'

import { author as _author, description, displayName, main, name, resources, version } from './package.json'

import { getDevFolder } from './src/lib/electron-app/release/utils/path'

console.log('App directory:', getDevFolder(main))
const author = _author?.name ?? _author
const currentYear = new Date().getFullYear()
const authorInKebabCase = author.replace(/\s+/g, '-')
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase()

/** electron-builder thay `${os}` / `${ext}` ở runtime — escape để Biome không coi là placeholder JS sai. */
const artifactName = `${name}-v${version}-\${os}.\${ext}`

export default {
  appId,
  productName: displayName,
  copyright: `Copyright © ${currentYear} — ${author}`,

  /** node-pty@1.x ships N-API prebuilds — no MSVC rebuild on Windows */
  npmRebuild: false,
  beforeBuild: 'scripts/beforeBuild.cjs',

  publish: [
    {
      provider: 'github',
      owner: 'nguyentung164',
      repo: 'honey-badger',
      releaseType: 'release',
    },
  ],

  releaseInfo: {
    releaseNotesFile: 'release-notes.md',
  },

  directories: {
    app: getDevFolder(main),
    output: `dist/v${version}`,
  },

  asarUnpack: [
    'node_modules/@playwright/**',
    'node_modules/playwright/**',
    'node_modules/playwright-core/**',
    'node_modules/exceljs/**',
    'node_modules/pdfjs-dist/**',
    'node_modules/node-pty/**',
  ],

  extraResources: [
    {
      from: 'spotbugs-4.9.3',
      to: 'spotbugs-4.9.3',
      filter: ['**/*'],
    },
    {
      from: 'gitleaks',
      to: 'gitleaks',
      filter: ['**/*'],
    },
    {
      from: 'src/resources/public',
      to: 'public',
      filter: ['**/*'],
    },
    {
      from: 'src/main/task/schema/schema.sql',
      to: 'task-schema/schema.sql',
    },
    {
      from: 'src/main/terminal/scripts',
      to: 'terminal-scripts',
      filter: ['**/*'],
    },
  ],

  mac: {
    artifactName,
    icon: `${resources}/build/icons/icon.ico`,
    category: 'public.app-category.utilities',
    target: ['zip', 'dmg', 'dir'],
  },

  linux: {
    artifactName,
    category: 'Utilities',
    synopsis: description,
    target: ['AppImage', 'deb', 'pacman', 'freebsd', 'rpm'],
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: true,
  },

  win: {
    artifactName,
    icon: `${resources}/build/icons/icon.ico`,
    target: ['nsis'],
  },
} satisfies Configuration
