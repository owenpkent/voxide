import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/renderer/'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
})
