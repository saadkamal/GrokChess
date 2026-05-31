import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Stockfish WASM is bundled directly for client-side chess computation.
  // This results in a larger bundle size (~500KB gzipped is expected).
  build: {
    chunkSizeWarningLimit: 600,
  },

  optimizeDeps: {
    exclude: ['src/lib/stockfish.worker.ts'],
  },

  server: {
    headers: {
      // Required for Stockfish to use SharedArrayBuffer
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
