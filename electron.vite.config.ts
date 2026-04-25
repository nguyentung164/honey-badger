import { dirname, normalize, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import reactPlugin from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'electron-vite'
import injectProcessEnvPlugin from 'rollup-plugin-inject-process-env'
import tsconfigPathsPlugin from 'vite-tsconfig-paths'

import { main, resources } from './package.json'
import { settings } from './src/lib/electron-router-dom'

const [nodeModules, devFolder] = normalize(dirname(main)).split(/\/|\\/g)
const devPath = [nodeModules, devFolder].join('/')

const tsconfigPaths = tsconfigPathsPlugin({
  projects: [resolve('tsconfig.json')],
})

export default defineConfig({
  main: {
    plugins: [tsconfigPaths],

    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
        },

        output: {
          dir: resolve(devPath, 'main'),
        },
      },
    },
  },

  preload: {
    plugins: [tsconfigPaths],
    build: {
      externalizeDeps: true,
      outDir: resolve(devPath, 'preload'),
    },
  },

  renderer: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      'process.platform': JSON.stringify(process.platform),
    },

    server: {
      port: settings.port,
    },

    plugins: [
      tsconfigPaths,
      tailwindcss(),
      codeInspectorPlugin({
        bundler: 'vite',
        hotKeys: ['altKey'],
        hideConsole: true,
      }),
      reactPlugin(),
    ],

    publicDir: resolve(resources, 'public'),

    build: {
      outDir: resolve(devPath, 'renderer'),

      rollupOptions: {
        plugins: [
          injectProcessEnvPlugin({
            NODE_ENV: 'production',
            platform: process.platform,
          }),
        ],

        input: {
          index: resolve('src/renderer/index.html'),
        },

        output: {
          dir: resolve(devPath, 'renderer'),
          manualChunks: id => {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'react'
              if (id.includes('@monaco-editor')) return 'monaco'
              if (id.includes('recharts')) return 'recharts'
              if (id.includes('framer-motion')) return 'framer-motion'
            }
          },
        },
      },
    },
  },
})
