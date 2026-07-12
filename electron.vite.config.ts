import { dirname, normalize, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import reactPlugin from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'electron-vite'

import { main, resources } from './package.json'
import { settings } from './src/lib/electron-router-dom'

const [nodeModules, devFolder] = normalize(dirname(main)).split(/\/|\\/g)
const devPath = [nodeModules, devFolder].join('/')

const tsconfigPaths = { tsconfigPaths: true } as const

export default defineConfig({
  main: {
    resolve: tsconfigPaths,

    build: {
      externalizeDeps: true,
      rollupOptions: {
        // Native modules must stay external — bundling breaks prebuild path resolution.
        external: ['electron', /^electron\/.+/, 'node-pty'],
        input: {
          index: resolve('src/main/index.ts'),
          ptyHost: resolve('src/main/terminal/ptyHost/ptyHostMain.ts'),
        },

        output: {
          format: 'cjs',
          dir: resolve(devPath, 'main'),
        },
      },
    },
  },

  preload: {
    resolve: tsconfigPaths,
    build: {
      externalizeDeps: true,
      outDir: resolve(devPath, 'preload'),
    },
  },

  renderer: {
    resolve: tsconfigPaths,

    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'process.platform': JSON.stringify(process.platform),
    },

    server: {
      port: settings.port,
    },

    plugins: [
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
