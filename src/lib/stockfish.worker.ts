// Stockfish Web Worker (classic worker so we can use importScripts)
// This runs the real Stockfish engine in a background thread.

/// <reference lib="webworker" />

let stockfish: any = null;

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    // Load real Stockfish 16 (best quality engine)
    // Using proven working CDN. For fully offline, download the files to public/stockfish/
    importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/stockfish.wasm.js');

    // @ts-ignore - Stockfish global
    stockfish = new (self as any).Stockfish();

    stockfish.onmessage = (line: string) => {
      self.postMessage({ type: 'message', data: line });
    };

    stockfish.postMessage('uci');
    self.postMessage({ type: 'ready' });
  }

  if (type === 'command' && stockfish) {
    stockfish.postMessage(data);
  }
};
