import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'src/main.tsx',
        'src/**/*.test.ts',
        'src/lib/stockfish.worker.ts',
        'src/lib/stockfishService.ts', // WASM - hard to unit test
      ],
    },
  },
})
