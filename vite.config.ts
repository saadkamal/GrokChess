import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Stockfish WASM is served from public/stockfish for client-side chess computation.
  // The app bundle itself remains smaller while the engine stays available offline/self-hosted.
  build: {
    chunkSizeWarningLimit: 600,
  },

  server: {
    headers: {
      // Required for Stockfish to use SharedArrayBuffer
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
