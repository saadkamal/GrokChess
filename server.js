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

// Serve static files from dist/
const serve = sirv(dist, {
  single: true,           // SPA fallback to index.html
  dev: false,
  etag: true,
  maxAge: 31536000,       // 1 year cache for assets
});

app.use(serve);

// Health check for Railway
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.listen(port, () => {
  console.log(`GrokChess running on port ${port}`);
});
