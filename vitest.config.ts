import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'node_modules/.dev'],
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      main: path.resolve(__dirname, './src/main'),
      shared: path.resolve(__dirname, './src/shared'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      main: path.resolve(__dirname, './src/main'),
      shared: path.resolve(__dirname, './src/shared'),
    },
  },
})
