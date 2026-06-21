// Stockfish service with local WASM loading, readiness checks, request queueing, and timeouts.

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let initResolve: (() => void) | null = null;
let initReject: ((error: Error) => void) | null = null;
let initTimeout: ReturnType<typeof setTimeout> | null = null;
let sawUciOk = false;

const listeners: ((line: string) => void)[] = [];
const STOCKFISH_WORKER_URL = '/stockfish/stockfish-nnue-16.js#/stockfish/stockfish-nnue-16.wasm';
const INIT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 12000;

type StockfishResult = {
  bestMove: string;
  /** White-relative evaluation in pawns. Positive means White is better. */
  eval: number;
  /** White-relative mate distance. Positive means White mates; negative means Black mates. */
  mate?: number;
  pv?: string;
  multiPV?: Array<{ move: string; eval: number; pv: string; mate?: number }>;
  timedOut?: boolean;
};

type PendingRequest = {
  fen: string;
  turn: 'w' | 'b';
  skillLevel: number;
  options: { depth?: number; movetime?: number; multiPV?: number; timeoutMs?: number };
  resolve: (result: StockfishResult) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

type ParsedScore = {
  eval: number;
  mate?: number;
};

type MultiPVLine = { index: number; move: string; eval: number; pv: string; mate?: number };

const requestQueue: PendingRequest[] = [];
let activeRequest: PendingRequest | null = null;
let currentEval: number | null = null;
let currentMate: number | undefined;
let currentPV: string | null = null;
let multiPVResults: MultiPVLine[] = [];

function fenTurn(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function normalizeScoreForWhite(rawScore: number, turn: 'w' | 'b'): number {
  return turn === 'w' ? rawScore : -rawScore;
}

function parseScore(line: string, turn: 'w' | 'b'): ParsedScore | null {
  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) {
    return { eval: normalizeScoreForWhite(parseInt(cpMatch[1], 10) / 100, turn) };
  }

  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const mateForSideToMove = parseInt(mateMatch[1], 10);
    const mate = normalizeScoreForWhite(mateForSideToMove, turn);
    const sign = mate > 0 ? 1 : -1;
    // Keep eval numeric for existing UI while preserving exact mate separately.
    return { eval: sign * (1000 - Math.min(Math.abs(mate), 100) / 100), mate };
  }

  return null;
}

function clearActiveTimeout() {
  if (activeRequest?.timeout) {
    clearTimeout(activeRequest.timeout);
    activeRequest.timeout = undefined;
  }
}

function resetSearchState() {
  currentEval = null;
  currentMate = undefined;
  currentPV = null;
  multiPVResults = [];
}

function finishActiveRequest(bestMove: string, extra: Partial<StockfishResult> = {}) {
  if (!activeRequest) return;

  clearActiveTimeout();
  activeRequest.resolve({
    bestMove,
    eval: currentEval ?? 0,
    mate: currentMate,
    pv: currentPV ?? undefined,
    multiPV: multiPVResults.length > 0
      ? [...multiPVResults]
          .sort((a, b) => a.index - b.index)
          .map((line) => ({ move: line.move, eval: line.eval, pv: line.pv, mate: line.mate }))
      : undefined,
    ...extra,
  });

  activeRequest = null;
  resetSearchState();
  processNextRequest();
}

function rejectInit(error: Error) {
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }
  initReject?.(error);
  initResolve = null;
  initReject = null;
  initPromise = null;
  sawUciOk = false;
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function resolveInit() {
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }
  initResolve?.();
  initResolve = null;
  initReject = null;
}

function resetWorkerAfterRequestFailure() {
  const failedRequest = activeRequest;
  clearActiveTimeout();
  activeRequest = null;
  resetSearchState();

  failedRequest?.resolve({ bestMove: '', eval: 0, timedOut: true });

  if (worker) {
    worker.terminate();
    worker = null;
  }
  initPromise = null;
  initResolve = null;
  initReject = null;
  sawUciOk = false;

  if (requestQueue.length > 0) {
    void initStockfish()
      .then(processNextRequest)
      .catch(() => {
        while (requestQueue.length > 0) {
          requestQueue.shift()!.resolve({ bestMove: '', eval: 0, timedOut: true });
        }
      });
  }
}

function processNextRequest() {
  if (activeRequest || requestQueue.length === 0 || !worker) return;

  activeRequest = requestQueue.shift()!;
  resetSearchState();

  const { fen, skillLevel, options } = activeRequest;
  const { depth, movetime, multiPV = 1 } = options;
  const timeoutMs = options.timeoutMs ?? Math.max(REQUEST_TIMEOUT_MS, (movetime ?? 0) + 3000);

  activeRequest.timeout = setTimeout(() => {
    sendCommand('stop');
    resetWorkerAfterRequestFailure();
  }, timeoutMs);

  sendCommand(`setoption name Skill Level value ${Math.max(0, Math.min(20, skillLevel))}`);
  sendCommand(`setoption name MultiPV value ${Math.max(1, Math.min(3, multiPV))}`);
  sendCommand(`position fen ${fen}`);

  if (movetime) {
    sendCommand(`go movetime ${movetime}`);
  } else {
    sendCommand(`go depth ${depth || 15}`);
  }
}

function handleInitLine(line: string) {
  if (line === 'uciok') {
    sawUciOk = true;
    sendCommand('isready');
    return;
  }

  if (sawUciOk && line === 'readyok') {
    resolveInit();
    processNextRequest();
  }
}

function handleMessage(line: string) {
  handleInitLine(line);

  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    finishActiveRequest(parts[1] ?? '');
    return;
  }

  if (!activeRequest) {
    listeners.forEach(fn => fn(line));
    return;
  }

  const parsedScore = parseScore(line, activeRequest.turn);
  const pvMatch = line.match(/ pv (.+)/);
  const multiMatch = line.match(/multipv (\d+)/);

  if (parsedScore && (!multiMatch || multiMatch[1] === '1')) {
    currentEval = parsedScore.eval;
    currentMate = parsedScore.mate;
  }

  if (pvMatch && (!multiMatch || multiMatch[1] === '1')) {
    currentPV = pvMatch[1];
  }

  if (multiMatch && parsedScore && pvMatch) {
    const index = parseInt(multiMatch[1], 10);
    const move = pvMatch[1].split(' ')[0];
    const idx = multiPVResults.findIndex(r => r.index === index);
    const next = { index, move, eval: parsedScore.eval, mate: parsedScore.mate, pv: pvMatch[1] };

    if (idx >= 0) {
      multiPVResults[idx] = next;
    } else {
      multiPVResults.push(next);
    }
    multiPVResults.sort((a, b) => a.index - b.index);
    if (multiPVResults.length > 3) multiPVResults.length = 3;
  }

  listeners.forEach(fn => fn(line));
}

export function initStockfish(): Promise<void> {
  if (worker && !initPromise) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
    sawUciOk = false;

    try {
      worker = new Worker(STOCKFISH_WORKER_URL);
    } catch (error) {
      rejectInit(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    initTimeout = setTimeout(() => {
      rejectInit(new Error('Stockfish initialization timed out'));
    }, INIT_TIMEOUT_MS);

    worker.onmessage = (e) => {
      if (typeof e.data === 'string') {
        handleMessage(e.data);
      }
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || 'Stockfish worker failed');
      if (initReject) rejectInit(error);
      else resetWorkerAfterRequestFailure();
    };

    worker.onmessageerror = () => {
      const error = new Error('Stockfish worker sent an unreadable message');
      if (initReject) rejectInit(error);
      else resetWorkerAfterRequestFailure();
    };

    sendCommand('uci');
  });

  return initPromise;
}

export function sendCommand(cmd: string) {
  if (worker) worker.postMessage(cmd);
}

export async function getBestMove(
  fen: string,
  skillLevel = 20,
  options: { depth?: number; movetime?: number; multiPV?: number; timeoutMs?: number } = {}
): Promise<StockfishResult> {
  await initStockfish();

  return new Promise((resolve) => {
    requestQueue.push({ fen, turn: fenTurn(fen), skillLevel, options, resolve });
    processNextRequest();
  });
}

export async function analyzePosition(fen: string, depth = 18) {
  return getBestMove(fen, 20, { depth, multiPV: 3 });
}

export async function getFastAnalysis(fen: string) {
  return getBestMove(fen, 20, { movetime: 1100, multiPV: 1 });
}

/** Coach recommendations: ensure Stockfish is ready, then analyze with fallbacks. */
export async function resolveCoachRecommendation(fen: string): Promise<StockfishResult | null> {
  for (const movetime of [1200, 2200]) {
    try {
      const result = await getBestMove(fen, 20, { movetime, multiPV: 1, timeoutMs: movetime + 2500 });
      if (result.bestMove && result.bestMove !== '(none)') return result;
    } catch {
      // Try the next fallback path below.
    }
  }

  return null;
}

/** @deprecated Use resolveCoachRecommendation */
export async function getCoachAnalysis(fen: string): Promise<StockfishResult | null> {
  return resolveCoachRecommendation(fen);
}

export function setSkillLevel(level: number) {
  sendCommand(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
}

export function destroyStockfish() {
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }
  clearActiveTimeout();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  initPromise = null;
  initResolve = null;
  initReject = null;
  sawUciOk = false;
  activeRequest = null;
  requestQueue.length = 0;
  resetSearchState();
}
