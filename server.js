/**
 * Production server for GrokChess
 * Serves the built static files with required headers for Stockfish WASM.
 *
 * Built by Saad Kamal with xAI's Grok 4.3
 */

import express from 'express';
import sirv from 'sirv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

const app = express();
const port = process.env.PORT || 3000;

// Required headers for SharedArrayBuffer (Stockfish WASM)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Health check for Railway (must be before SPA fallback)
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Serve static files from dist/. Hashed Vite assets are safe to cache long-term;
// index.html / SPA fallback must revalidate so Railway deploys are picked up quickly.
const serve = sirv(dist, {
  single: true,           // SPA fallback to index.html
  dev: false,
  etag: true,
  maxAge: 0,
  setHeaders(res, pathname) {
    if (pathname.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public,max-age=31536000,immutable');
    } else if (pathname.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
});

app.use(serve);

app.listen(port, () => {
  console.log(`GrokChess running on port ${port}`);
});
