// Enhanced Stockfish Service with MultiPV + PV + Skill levels

let worker: Worker | null = null;
const listeners: ((line: string) => void)[] = [];

type StockfishResult = {
  bestMove: string;
  eval: number;
  pv?: string;
  multiPV?: Array<{ move: string; eval: number; pv: string }>;
};

type PendingRequest = {
  fen: string;
  skillLevel: number;
  options: { depth?: number; movetime?: number; multiPV?: number };
  resolve: (result: StockfishResult) => void;
};

const requestQueue: PendingRequest[] = [];
let activeRequest: PendingRequest | null = null;
let currentEval: number | null = null;
let currentPV: string | null = null;
let multiPVResults: Array<{ move: string; eval: number; pv: string }> = [];

function finishActiveRequest(bestMove: string) {
  if (!activeRequest) return;

  activeRequest.resolve({
    bestMove,
    eval: currentEval ?? 0,
    pv: currentPV ?? undefined,
    multiPV: multiPVResults.length > 0 ? [...multiPVResults] : undefined,
  });

  activeRequest = null;
  currentEval = null;
  currentPV = null;
  multiPVResults = [];
  processNextRequest();
}

function processNextRequest() {
  if (activeRequest || requestQueue.length === 0 || !worker) return;

  activeRequest = requestQueue.shift()!;
  currentEval = null;
  currentPV = null;
  multiPVResults = [];

  const { fen, skillLevel, options } = activeRequest;
  const { depth, movetime, multiPV = 1 } = options;

  sendCommand(`setoption name Skill Level value ${skillLevel}`);
  sendCommand(`setoption name MultiPV value ${multiPV}`);
  sendCommand(`position fen ${fen}`);

  if (movetime) {
    sendCommand(`go movetime ${movetime}`);
  } else {
    sendCommand(`go depth ${depth || 15}`);
  }
}

function handleMessage(line: string) {
  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    finishActiveRequest(parts[1] ?? '');
  }

  if (!activeRequest) return;

  if (line.includes('score cp')) {
    const match = line.match(/score cp (-?\d+)/);
    if (match) currentEval = parseInt(match[1]) / 100;
  }

  if (line.includes(' pv ')) {
    const pvMatch = line.match(/ pv (.+)/);
    if (pvMatch) currentPV = pvMatch[1];
  }

  if (line.includes('multipv')) {
    const multiMatch = line.match(/multipv (\d+)/);
    const scoreMatch = line.match(/score cp (-?\d+)/);
    const pvMatch = line.match(/ pv (.+)/);

    if (multiMatch && scoreMatch && pvMatch) {
      const move = pvMatch[1].split(' ')[0];
      const evalCp = parseInt(scoreMatch[1]) / 100;

      const idx = multiPVResults.findIndex(r => r.move === move);
      if (idx >= 0) {
        multiPVResults[idx] = { move, eval: evalCp, pv: pvMatch[1] };
      } else {
        multiPVResults.push({ move, eval: evalCp, pv: pvMatch[1] });
      }
      multiPVResults.sort((a, b) => b.eval - a.eval);
      if (multiPVResults.length > 3) multiPVResults.length = 3;
    }
  }

  listeners.forEach(fn => fn(line));
}

export function initStockfish(): Promise<void> {
  return new Promise((resolve) => {
    if (worker) {
      resolve();
      return;
    }

    worker = new Worker(new URL('./stockfish.worker.ts', import.meta.url));

    worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'ready') resolve();
      if (type === 'message') handleMessage(data);
    };

    worker.postMessage({ type: 'init' });
  });
}

export function sendCommand(cmd: string) {
  if (worker) worker.postMessage({ type: 'command', data: cmd });
}

export function getBestMove(
  fen: string,
  skillLevel = 20,
  options: { depth?: number; movetime?: number; multiPV?: number } = {}
): Promise<StockfishResult> {
  return new Promise((resolve) => {
    if (!worker) {
      resolve({ bestMove: 'e2e4', eval: 0 });
      return;
    }

    requestQueue.push({ fen, skillLevel, options, resolve });
    processNextRequest();
  });
}

export async function analyzePosition(fen: string, depth = 18) {
  return getBestMove(fen, 20, { depth, multiPV: 3 });
}

export async function getFastAnalysis(fen: string) {
  return getBestMove(fen, 20, { movetime: 1100, multiPV: 3 });
}

export function setSkillLevel(level: number) {
  sendCommand(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
}
