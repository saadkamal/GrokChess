/**
 * GrokChess - Main Application
 *
 * A premium, educational chess trainer with AI opponents and real-time coaching.
 *
 * Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)
 *
 * @license MIT
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import type { Square, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { RotateCcw, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { initStockfish, getBestMove as stockfishGetBestMove, getCoachAnalysis } from './lib/stockfishService';
import { getBestMove as getCustomBestMove, pieceCodeToPromotion } from './lib/chessLogic';
import { buildCoachRecommendationText } from './lib/coachText';

import './App.css';

// Types
type Difficulty = 'easy' | 'medium' | 'hard';

type MoveQuality = 'brilliant' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

interface CoachInsight {
  id: number;
  text: string;
  quality?: MoveQuality;
  moveSan?: string;
  isPlayerMove: boolean;
  highlightedSquares?: Square[];
  timestamp: Date;
  streaming?: boolean;
  fullText?: string;
  createdAtMove?: number;
}

const COACH_LOADING_TEXT = 'Analyzing this position for the best move…';

function isRecommendationInsight(insight: CoachInsight): boolean {
  return Boolean(insight.fullText) || insight.text.startsWith('I recommend');
}

function pruneCoachInsightsForTakeback(prev: CoachInsight[], targetMove: number): CoachInsight[] {
  return prev
    .filter((insight) => {
      if (insight.id === 0) return true;
      if (isRecommendationInsight(insight)) return false;
      if (typeof insight.createdAtMove === 'number') return insight.createdAtMove <= targetMove;
      return true;
    })
    .map((insight) => ({
      ...insight,
      streaming: false,
      fullText: undefined,
      highlightedSquares: undefined,
    }));
}

const DIFFICULTY_CONFIG = {
  easy: { depth: 1, label: 'Beginner', description: 'Forgiving, great for learning fundamentals', color: '#4ade80' },
  medium: { depth: 2, label: 'Club Player', description: 'Solid play with occasional tactics', color: '#fbbf24' },
  hard: { depth: 3, label: 'Expert', description: 'Strong tactical and positional play', color: '#f87171' },
};

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,0,5,5,5,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

function getPSTValue(piece: string, square: Square, isWhite: boolean): number {
  const table = PST[piece.toLowerCase()];
  if (!table) return 0;
  let idx = square.charCodeAt(1) - 49;
  idx = 7 - idx;
  let file = square.charCodeAt(0) - 97;
  if (!isWhite) { idx = 7 - idx; file = 7 - file; }
  return table[idx * 8 + file];
}

function evaluatePosition(chess: Chess): number {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sq = (String.fromCharCode(97 + c) + (8 - r)) as Square;
      const val = PIECE_VALUES[piece.type] + getPSTValue(piece.type, sq, piece.color === 'w');
      score += piece.color === 'w' ? val : -val;
    }
  }
  const center = ['d4', 'd5', 'e4', 'e5'] as Square[];
  center.forEach(sq => {
    const p = chess.get(sq);
    if (p) score += p.color === 'w' ? 8 : -8;
  });
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const aCapture = a.captured ? PIECE_VALUES[a.captured] : 0;
    const bCapture = b.captured ? PIECE_VALUES[b.captured] : 0;
    return bCapture - aCapture;
  });
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
  if (depth === 0 || chess.isGameOver()) {
    if (chess.isCheckmate()) return isMaximizing ? -99999 : 99999;
    if (chess.isDraw()) return 0;
    return evaluatePosition(chess);
  }
  const moves = orderMoves(chess.moves({ verbose: true }) as Move[]);
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const evalScore = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getBestMove(fen: string, difficulty: Difficulty): { san: string; from: Square; to: Square; eval: number } | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const config = DIFFICULTY_CONFIG[difficulty];
  const depth = config.depth;
  const allMoves = chess.moves({ verbose: true }) as Move[];
  if (difficulty === 'easy' && Math.random() < 0.35) {
    const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];
    chess.move(randomMove);
    const evalScore = evaluatePosition(chess);
    chess.undo();
    return { san: randomMove.san, from: randomMove.from, to: randomMove.to, eval: evalScore };
  }
  let bestMove: Move | null = null;
  let bestValue = chess.turn() === 'w' ? -Infinity : Infinity;
  const ordered = orderMoves(allMoves);
  for (const move of ordered) {
    chess.move(move);
    const value = minimax(chess, depth - 1, -Infinity, Infinity, chess.turn() === 'w');
    chess.undo();
    if (chess.turn() === 'w') {
      if (value > bestValue) { bestValue = value; bestMove = move; }
    } else {
      if (value < bestValue) { bestValue = value; bestMove = move; }
    }
  }
  if (!bestMove) return null;
  return { san: bestMove.san, from: bestMove.from, to: bestMove.to, eval: bestValue };
}

type PromotionPiece = 'q' | 'r' | 'b' | 'n';

type EngineMove = {
  san: string;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  eval: number;
  pv?: string;
};

function parseUciMove(uci: string): { from: Square; to: Square; promotion?: PromotionPiece } | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci[4];
  const promotion = promoChar && ['q', 'r', 'b', 'n'].includes(promoChar)
    ? promoChar as PromotionPiece
    : undefined;
  return { from, to, promotion };
}

function applyChessMove(
  chess: Chess,
  move: { san?: string; from?: Square; to?: Square; promotion?: PromotionPiece }
): Move | null {
  try {
    if (move.san) return chess.move(move.san);
    if (move.from && move.to) {
      return chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    }
    return null;
  } catch {
    console.warn('Failed to apply move', move);
    return null;
  }
}

/** Rebuild chess.js state from our move log — keeps undo/history in sync for take-back. */
function replayMoveHistory(chess: Chess, moves: Move[]): void {
  chess.reset();
  for (const m of moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion as PromotionPiece | undefined });
  }
}

function pickRandomLegalMove(fen: string): Move | null {
  const trial = new Chess(fen);
  const legal = trial.moves({ verbose: true }) as Move[];
  if (legal.length === 0) return null;
  return legal[Math.floor(Math.random() * legal.length)];
}

function resolveAiMove(
  fen: string,
  engineMove: EngineMove | null,
): { move: Move; fen: string; usedFallback: boolean } | null {
  const trial = new Chess(fen);
  if (engineMove) {
    const applied = applyChessMove(trial, engineMove);
    if (applied) return { move: applied, fen: trial.fen(), usedFallback: false };
  }
  const fallback = pickRandomLegalMove(fen);
  if (!fallback) return null;
  trial.load(fen);
  const applied = applyChessMove(trial, {
    from: fallback.from,
    to: fallback.to,
    promotion: fallback.promotion as PromotionPiece | undefined,
  });
  if (!applied) return null;
  return { move: applied, fen: trial.fen(), usedFallback: !!engineMove };
}

async function getBestMoveSmart(fen: string, difficulty: Difficulty): Promise<EngineMove | null> {
  if (difficulty === 'easy') {
    return getBestMove(fen, difficulty);
  }
  const skillMap = { medium: 13, hard: 20 };
  const timeMap = { medium: 950, hard: 2200 };
  const depthForHard = 18;

  const stockfishCall = (async () => {
    try {
      const opts = difficulty === 'hard' ? { depth: depthForHard, multiPV: 3 } : { movetime: timeMap[difficulty], multiPV: 1 };
      const result = await stockfishGetBestMove(fen, skillMap[difficulty], opts);
      if (result?.bestMove) {
        const parsed = parseUciMove(result.bestMove);
        if (!parsed) return null;
        return {
          san: '',
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
          eval: result.eval || 0,
          pv: result.pv,
        };
      }
    } catch { console.warn('Stockfish call failed'); }
    return null;
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), difficulty === 'hard' ? 4500 : 2500));
  const result = await Promise.race([stockfishCall, timeout]);
  if (result) return result;
  console.warn('Stockfish too slow or failed — using fallback');
  return getCustomBestMove(fen, DIFFICULTY_CONFIG[difficulty].depth);
}

function getPieceFullName(piece: string): string {
  const map: Record<string, string> = { p: 'pawn', n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  return map[piece] || 'piece';
}

function getSquareDescription(square: Square): string {
  const descriptions: Record<string, string> = {
    c6: "c6 — a very natural square for the knight", f6: "f6 — the most common square for the king's knight",
    c3: "c3 — the natural developing square for the queen's knight", f3: "f3 — the best square for the king's knight",
    d4: "d4 — the center", e4: "e4 — the center", d5: "d5 — the center", e5: "e5 — the center",
  };
  return descriptions[square] || square;
}

function explainOpponentMove(move: Move): string {
  const to = move.to;
  if (move.piece === 'n' && to === 'c6') return `Black just developed their queen's knight to c6. This is one of the best developing moves in the opening. The knight on c6 controls the two most important central squares (d4 and e5) and prepares to support a pawn push to e5 or d5 later.`;
  if (move.piece === 'n' && to === 'f6') return `Black has brought out their king's knight to f6. This is the most popular developing move for Black in many openings. The knight attacks e4 and d5, helps control the center, and gets Black closer to castling kingside.`;
  if (move.piece === 'n' && (to === 'c3' || to === 'f3')) return `Black developed a knight toward the center. This is a standard developing move that improves their piece activity and fights for control of the middle of the board.`;
  if (move.piece === 'p' && (to === 'e5' || to === 'd5' || to === 'e4' || to === 'd4')) return `Black just pushed a pawn into the center. This claims space and opens lines for their bishop and queen. Controlling the center is one of the most important goals early in the game.`;
  if (move.piece === 'b') return `Black developed their bishop to an active square. Bishops work best on long diagonals, so getting them out early helps control more of the board.`;
  const squareDesc = getSquareDescription(to);
  const pieceName = getPieceFullName(move.piece);
  return `Black moved their ${pieceName} to ${squareDesc}. This brings another piece into play and helps fight for the center.`;
}

function explainPlayerMove(move: Move): string {
  const to = move.to;
  if (move.piece === 'n' && (to === 'f3' || to === 'c3')) return `Good developing move. Knights belong on f3 or c3 in the opening because those squares control the center and help you prepare for castling.`;
  if (move.piece === 'p' && (to === 'e4' || to === 'd4' || to === 'e5' || to === 'd5')) return `Excellent — you're fighting for the center with your pawn. Central pawns are very important because they control key squares and open paths for your pieces.`;
  if (move.piece === 'b' || move.piece === 'n') return `Nice development. Getting your minor pieces (knights and bishops) out early is one of the fundamental rules of the opening.`;
  return `In general, try to develop your pieces toward the center and improve the activity of your least active pieces.`;
}

function generateCoachInsight(game: Chess, lastMove: Move | null, isPlayerMove: boolean, _difficulty: Difficulty, shouldHighlight: boolean = true): CoachInsight {
  const id = Date.now();
  const moveSan = lastMove?.san || '';
  let text = ''; // eslint-disable-line no-useless-assignment -- assigned in multiple branches below
  let quality: MoveQuality | undefined;
  const highlighted: Square[] = [];

  if (game.isCheckmate()) {
    text = isPlayerMove ? "Beautiful! You delivered checkmate. Excellent calculation." : "Checkmate. The opponent found the winning sequence. Study the final position.";
    return { id, text, isPlayerMove, timestamp: new Date() };
  }
  if (game.isDraw()) {
    text = game.isStalemate() ? "Stalemate — a classic drawing resource." : "The game ended in a draw. Good defense from both sides.";
    return { id, text, isPlayerMove, timestamp: new Date() };
  }
  if (!lastMove) {
    return { id, text: "Game started. Focus on developing your pieces toward the center and getting your king safe.", isPlayerMove: true, timestamp: new Date() };
  }

  const captured = lastMove.captured;
  const isCheck = lastMove.san.includes('+');
  const isCastle = lastMove.san.includes('O-O');

  if (isPlayerMove) {
    if (isCastle) {
      text = "Excellent! Castling is one of the most important moves in the opening. It moves your king to safety and brings your rook into the game.";
      quality = 'great';
    } else if (captured) {
      const oppPiece = lastMove.captured === 'p' ? 'pawn' : getPieceFullName(lastMove.captured!);
      text = lastMove.captured === 'q' ? `You captured the queen! That's a huge advantage.` : `Good capture — you took the ${oppPiece}.`;
      quality = 'good';
    } else if (isCheck) {
      text = `You gave check with the ${getPieceFullName(lastMove.piece)}. Checks are powerful because they force the opponent to respond immediately.`;
      quality = 'good';
    } else {
      text = explainPlayerMove(lastMove);
      quality = 'good';
    }
  } else {
    if (captured) {
      const capturer = getPieceFullName(lastMove.piece);
      text = `Black's ${capturer} captured your ${captured === 'p' ? 'pawn' : getPieceFullName(captured)}. `;
      text += "Consider whether you should recapture or create a bigger threat elsewhere.";
    } else if (isCheck) {
      text = `Black gave check. You must respond to the check right away.`;
    } else if (isCastle) {
      text = "Black has castled. Their king is now much safer.";
    } else {
      text = explainOpponentMove(lastMove);
    }
    const legal = game.moves({ verbose: true }) as Move[];
    const captures = legal.filter(m => m.captured);
    if (captures.length > 0) {
      if (captures.length === 1) {
        const c = captures[0];
        text += ` You can capture their ${getPieceFullName(c.captured!)} on ${c.to.toUpperCase()} with your ${getPieceFullName(c.piece)}.`;
      } else {
        const firstTwo = captures.slice(0, 2).map(c => `your ${getPieceFullName(c.piece)} can take the ${getPieceFullName(c.captured!)} on ${c.to.toUpperCase()}`);
        text += ` You have captures: ${firstTwo.join(' and ')}.`;
      }
    }
  }

  if (shouldHighlight && lastMove) {
    highlighted.push(lastMove.from, lastMove.to);
  }

  return { id, text, quality, moveSan, isPlayerMove, highlightedSquares: highlighted.length ? highlighted : undefined, timestamp: new Date() };
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function App() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [boardRenderKey, setBoardRenderKey] = useState(0);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [isThinking, setIsThinking] = useState(false);
  const [coachInsights, setCoachInsights] = useState<CoachInsight[]>([
    { id: 0, text: "I am your coach. I analyze every position in real time and will show you the strongest move after each turn.", isPlayerMove: true, timestamp: new Date() }
  ]);
  const [gameStatus, setGameStatus] = useState<'playing' | 'white-wins' | 'black-wins' | 'draw'>('playing');

  // Dedicated state for recommendation highlights — allows instant synchronous-style clearing on user move to eliminate ghosting
  const [recommendationHighlights, setRecommendationHighlights] = useState<Square[] | null>(null);

  // Dedicated state for last-move square highlights (subtle red/cyan). Same pattern as rec highlights
  // so that Black's move animations also get crisp, non-ghosting last-move squares.
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: Square; to: Square } | null>(null);
  const [isCoachOpen, setIsCoachOpen] = useState(true); // Collapsible on mobile

  // Refs to cancel pending async work (prevents ghost moves, highlights, and coach text)
  const pendingAiMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecommendationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTakebackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameGenerationRef = useRef(0);

  const clearPendingTimers = useCallback(() => {
    if (pendingAiMoveTimeoutRef.current) {
      clearTimeout(pendingAiMoveTimeoutRef.current);
      pendingAiMoveTimeoutRef.current = null;
    }
    if (pendingRecommendationTimeoutRef.current) {
      clearTimeout(pendingRecommendationTimeoutRef.current);
      pendingRecommendationTimeoutRef.current = null;
    }
    if (pendingTakebackTimeoutRef.current) {
      clearTimeout(pendingTakebackTimeoutRef.current);
      pendingTakebackTimeoutRef.current = null;
    }
  }, []);

  const isGameOver = gameStatus !== 'playing';

  useEffect(() => {
    initStockfish().catch(() => {
      // Stockfish failed to load — fallback to custom engine only
    });
  }, []);

  const applyCoachRecommendation = useCallback(async (
    fen: string,
    generation: number,
    createdAtMove: number,
    loadingId?: number,
  ) => {
    const isActive = () => gameGenerationRef.current === generation;

    if (!isActive()) return;

    const analysis = await getCoachAnalysis(fen);
    if (!isActive()) return;

    if (!analysis?.bestMove || analysis.bestMove === '(none)') {
      if (loadingId != null) {
        setCoachInsights((prev) => prev.map((i) => (
          i.id === loadingId
            ? { ...i, text: 'Could not analyze this position — try again in a moment.', streaming: false }
            : i
        )));
      }
      return;
    }

    const parsed = parseUciMove(analysis.bestMove);
    if (!parsed || !isActive()) return;

    const position = new Chess(fen);
    if (position.isGameOver()) {
      if (loadingId != null) {
        setCoachInsights((prev) => prev.filter((i) => i.id !== loadingId));
      }
      return;
    }

    const text = buildCoachRecommendationText(
      position,
      { from: parsed.from, to: parsed.to, promotion: parsed.promotion },
      { eval: analysis.eval, multiPV: analysis.multiPV },
    );

    if (!isActive()) return;

    setRecommendationHighlights([parsed.from, parsed.to]);
    setLastMoveSquares(null);

    setCoachInsights((prev) => {
      const base = loadingId != null ? prev.filter((i) => i.id !== loadingId) : prev;
      return [...base, {
        id: Date.now() + 1,
        text: '',
        fullText: text,
        streaming: true,
        isPlayerMove: true,
        timestamp: new Date(),
        createdAtMove,
      }];
    });
  }, []);

  const resetGame = useCallback((newDifficulty?: Difficulty) => {
    const d = newDifficulty || difficulty;
    gameGenerationRef.current += 1;
    clearPendingTimers();
    chess.reset();
    setFen(chess.fen());
    setBoardRenderKey((k) => k + 1);
    setMoveHistory([]);
    setGameStatus('playing');
    setIsThinking(false);
    setRecommendationHighlights(null);
    setLastMoveSquares(null);
    setCoachInsights([{
      id: Date.now(),
      text: `New game — ${DIFFICULTY_CONFIG[d].label}. I will show the best move and explain exactly why after every turn.`,
      isPlayerMove: true,
      timestamp: new Date(),
    }]);
    if (newDifficulty) setDifficulty(d);
  }, [chess, difficulty, clearPendingTimers]);

  const makeMove = useCallback((from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): boolean => {
    if (isGameOver || isThinking) return false;
    const move = chess.move({ from, to, promotion });
    if (!move) return false;

    const newFen = chess.fen();
    const newHistory = [...moveHistory, move];
    setFen(newFen);
    setMoveHistory(newHistory);
    setRecommendationHighlights(null);
    setLastMoveSquares({ from: move.from, to: move.to });

    clearPendingTimers();

    const insight = generateCoachInsight(chess, move, true, difficulty);
    insight.createdAtMove = newHistory.length;
    setCoachInsights(prev => [...prev, insight]);

    if (chess.isGameOver()) {
      const status = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black-wins' : 'white-wins') : 'draw';
      setGameStatus(status);
      return true;
    }

    setIsThinking(true);
    const generation = gameGenerationRef.current;
    pendingAiMoveTimeoutRef.current = setTimeout(async () => {
      pendingAiMoveTimeoutRef.current = null;
      if (generation !== gameGenerationRef.current) return;

      try {
        const fenBeforeAi = chess.fen();
        const aiResult = await getBestMoveSmart(fenBeforeAi, difficulty);
        if (generation !== gameGenerationRef.current) return;

        const resolved = resolveAiMove(fenBeforeAi, aiResult);
        if (!resolved) {
          chess.undo();
          setFen(chess.fen());
          setMoveHistory(newHistory.slice(0, -1));
          setLastMoveSquares(newHistory.length > 1
            ? { from: newHistory[newHistory.length - 2].from, to: newHistory[newHistory.length - 2].to }
            : null);
          toast.error('AI could not respond — your move was undone.');
          return;
        }

        if (resolved.usedFallback) {
          toast.warning('Engine hiccup — played a legal move instead.');
        }

        const aiMove = resolved.move;
        const applied = applyChessMove(chess, {
          from: aiMove.from,
          to: aiMove.to,
          promotion: aiMove.promotion as PromotionPiece | undefined,
        });
        if (!applied) {
          replayMoveHistory(chess, newHistory);
          toast.error('AI could not respond — your move was undone.');
          setFen(chess.fen());
          setMoveHistory(newHistory.slice(0, -1));
          setLastMoveSquares(newHistory.length > 1
            ? { from: newHistory[newHistory.length - 2].from, to: newHistory[newHistory.length - 2].to }
            : null);
          return;
        }

        setLastMoveSquares(null);
        setRecommendationHighlights(null);

        const updatedFen = chess.fen();
        const updatedHistory = [...newHistory, aiMove];
        setFen(updatedFen);
        setMoveHistory(updatedHistory);
        requestAnimationFrame(() => {
          if (generation !== gameGenerationRef.current) return;
          setLastMoveSquares({ from: aiMove.from, to: aiMove.to });
          setRecommendationHighlights(null);
        });

        const aiInsight = generateCoachInsight(chess, aiMove, false, difficulty, false);
        aiInsight.createdAtMove = updatedHistory.length;
        setCoachInsights(prev => [...prev, aiInsight]);

        const recommendationGeneration = gameGenerationRef.current;
        const fenForRecommendation = chess.fen();
        pendingRecommendationTimeoutRef.current = setTimeout(() => {
            pendingRecommendationTimeoutRef.current = null;
            if (recommendationGeneration !== gameGenerationRef.current) return;
            void applyCoachRecommendation(fenForRecommendation, recommendationGeneration, updatedHistory.length);
          }, 420);

        if (generation === gameGenerationRef.current && chess.isGameOver()) {
          const status = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black-wins' : 'white-wins') : 'draw';
          setGameStatus(status);
        }
      } finally {
        if (generation === gameGenerationRef.current) {
          setIsThinking(false);
        }
      }
    }, difficulty === 'hard' ? 650 : 420);

    return true;
  }, [chess, difficulty, moveHistory, isGameOver, isThinking, clearPendingTimers, applyCoachRecommendation]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square): boolean => {
    if (chess.turn() !== 'w') { toast.error("It's not your turn"); return false; }
    return makeMove(sourceSquare, targetSquare);
  }, [chess, makeMove]);

  const onPromotionPieceSelect = useCallback((
    piece?: string,
    promoteFromSquare?: Square,
    promoteToSquare?: Square,
  ): boolean => {
    if (!promoteFromSquare || !promoteToSquare) return false;
    const promotion = pieceCodeToPromotion(piece);
    if (!promotion) return false;
    return makeMove(promoteFromSquare, promoteToSquare, promotion);
  }, [makeMove]);

  const takeBack = useCallback(() => {
    if (moveHistory.length === 0 || isThinking) return;
    gameGenerationRef.current += 1;
    clearPendingTimers();

    const movesToUndo = Math.min(2, moveHistory.length);
    const newHistory = moveHistory.slice(0, -movesToUndo);
    replayMoveHistory(chess, newHistory);
    const newFen = chess.fen();
    setFen(newFen);
    setBoardRenderKey((k) => k + 1);
    setMoveHistory(newHistory);
    const restoredLast = newHistory.length > 0 ? { from: newHistory[newHistory.length-1].from, to: newHistory[newHistory.length-1].to } : undefined;
    setLastMoveSquares(restoredLast || null);
    setGameStatus('playing');

    const loadingId = Date.now();
    setCoachInsights((prev) => [
      ...pruneCoachInsightsForTakeback(prev, newHistory.length),
      ...(chess.turn() === 'w'
        ? [{
            id: loadingId,
            text: COACH_LOADING_TEXT,
            isPlayerMove: true,
            timestamp: new Date(),
            createdAtMove: newHistory.length,
          }]
        : []),
    ]);

    if (chess.turn() === 'w') {
      setRecommendationHighlights(null);
      const generation = gameGenerationRef.current;
      const fenAtTakeback = newFen;
      pendingTakebackTimeoutRef.current = setTimeout(() => {
        pendingTakebackTimeoutRef.current = null;
        void applyCoachRecommendation(fenAtTakeback, generation, newHistory.length, loadingId);
      }, 0);
    } else {
      setRecommendationHighlights(null);
    }

    toast.success(`Took back ${movesToUndo} move${movesToUndo > 1 ? 's' : ''}`);
  }, [chess, moveHistory, isThinking, clearPendingTimers, applyCoachRecommendation]);

  const changeDifficulty = useCallback((newDiff: Difficulty) => {
    if (newDiff === difficulty && moveHistory.length > 0) return;
    resetGame(newDiff);
    toast.success(`Switched to ${DIFFICULTY_CONFIG[newDiff].label}`);
  }, [difficulty, moveHistory.length, resetGame]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); takeBack(); }
      if (e.key.toLowerCase() === 'r' && e.metaKey) { e.preventDefault(); resetGame(); }
      if (['1','2','3'].includes(e.key)) {
        const map: Record<string, Difficulty> = { '1': 'easy', '2': 'medium', '3': 'hard' };
        changeDifficulty(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [takeBack, resetGame, changeDifficulty]);

  let streamingInsightId: number | undefined;
  let streamingFullText: string | undefined;
  for (let i = coachInsights.length - 1; i >= 0; i -= 1) {
    const insight = coachInsights[i];
    if (insight.streaming && insight.fullText) {
      streamingInsightId = insight.id;
      streamingFullText = insight.fullText;
      break;
    }
  }

  // Streaming for recommendations — depend on stable id/text, not partial text updates
  useEffect(() => {
    if (!streamingInsightId || !streamingFullText) return;

    const insightId = streamingInsightId;
    const fullText = streamingFullText;
    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex += 3;
      const partial = fullText.slice(0, Math.min(currentIndex, fullText.length));
      setCoachInsights(prev => prev.map(insight => insight.id === insightId ? { ...insight, text: partial } : insight));
      if (currentIndex >= fullText.length) {
        clearInterval(interval);
        setCoachInsights(prev => prev.map(insight => insight.id === insightId ? { ...insight, streaming: false, text: fullText } : insight));
      }
    }, 18);
    return () => clearInterval(interval);
  }, [streamingInsightId, streamingFullText]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020206] text-[#c8c8d0] font-sans pb-[env(safe-area-inset-bottom)]">
      {/* Top bar — responsive for mobile */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2">
            <div className="text-[13px] sm:text-[15px] font-semibold tracking-[-0.5px] text-white">GROKCHESS</div>
            <div className="text-[9px] sm:text-[10px] text-white/40 tracking-[0.5px] sm:mt-0.5">Built with Grok</div>
          </div>
        </div>

        {/* Difficulty selector — more compact on mobile */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-black/60 backdrop-blur-xl rounded-full p-0.5 sm:p-1 border border-white/10 pointer-events-auto">
          {DIFFICULTIES.map((d) => {
            const cfg = DIFFICULTY_CONFIG[d];
            const active = d === difficulty;
            return (
              <button
                key={d}
                onClick={() => changeDifficulty(d)}
                className={`px-3 sm:px-5 py-1 text-[10px] sm:text-xs font-medium rounded-full transition-all ${active ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Action buttons — smaller on mobile */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-[10px] sm:text-xs pointer-events-auto">
          <button onClick={takeBack} disabled={moveHistory.length === 0 || isThinking} className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition">
            <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">TAKE BACK</span>
          </button>
          <button onClick={() => resetGame()} className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#ff4d6d]">
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">NEW</span>
          </button>
        </div>
      </div>

      {/* Premium Holographic Platform (CSS - strong futuristic presence) */}
      <div className={`absolute inset-0 pt-14 sm:pt-16 flex justify-center 
        ${isCoachOpen ? 'sm:items-center items-start pt-4 sm:pt-16 pb-0 sm:pb-8' : 'items-center sm:pb-8'}`}>
        <div 
          className={`relative holographic-platform ${isCoachOpen ? 'mt-8 sm:mt-3' : 'mt-3'} sm:mt-0`}
          style={{ 
            width: 'min(88vh, 92vw)', 
            height: 'min(88vh, 92vw)',
          }}
        >
          {/* Main dark base with deep material feel */}
          <div 
            className="absolute inset-0"
            style={{
              background: '#0a0a0f',
              borderRadius: '10px',
              boxShadow: `
                0 0 0 1px rgba(0, 229, 255, 0.12),
                0 0 80px 12px rgba(0, 229, 255, 0.16),
                0 0 160px 25px rgba(0, 229, 255, 0.07),
                0 50px 180px -40px rgb(0 0 0 / 0.95),
                inset 0 1px 0 rgba(255,255,255,0.03)
              `,
              border: '1px solid rgba(0, 229, 255, 0.1)'
            }}
          />

          {/* Inner beveled playing surface */}
          <div 
            className="absolute"
            style={{
              top: '4%',
              left: '4%',
              right: '4%',
              bottom: '4%',
              background: '#050508',
              borderRadius: '6px',
              boxShadow: `
                inset 0 0 0 1px rgba(0, 229, 255, 0.08),
                inset 0 20px 40px -10px rgba(0,0,0,0.6),
                inset 0 -10px 30px -5px rgba(255,255,255,0.015)
              `
            }}
          />
        </div>
      </div>

      {/* Main 2D Board */}
      <div className={`absolute inset-0 pt-14 sm:pt-16 z-10 flex justify-center 
        ${isCoachOpen ? 'sm:items-center items-start pt-4 sm:pt-16 pb-0 sm:pb-8' : 'items-center sm:pb-8'}`}>
        <div 
          className={`relative ${isCoachOpen ? 'mt-8 sm:mt-3' : 'mt-3'} sm:mt-0`} 
          style={{ 
            width: 'min(82vh, 86vw)', 
            height: 'min(82vh, 86vw)'
          }}
        >
          <Chessboard
            key={boardRenderKey}
            position={fen}
            onPieceDrop={onPieceDrop}
            onPromotionPieceSelect={onPromotionPieceSelect}
            animationDuration={200}
            boardOrientation="white"
            arePiecesDraggable={!isGameOver && !isThinking && chess.turn() === 'w'}
            autoPromoteToQueen={false}

            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: 'none',
              border: '1px solid rgba(255,255,255,0.06)', // subtle edge for better square definition on mobile
            }}
            customDarkSquareStyle={{ backgroundColor: '#0a0a0f' }}
            customLightSquareStyle={{ backgroundColor: '#2f2f3a' }}
            customDropSquareStyle={{ 
              boxShadow: 'inset 0 0 0 4px rgba(0,229,255,0.65)',
              backgroundColor: 'rgba(0,229,255,0.08)'
            }}
            customSquareStyles={useMemo(() => {
              const styles: Record<string, React.CSSProperties> = {};

              // Last move highlighting (very subtle)
              if (lastMoveSquares) {
                const isOpponentMove = chess.turn() === 'w';
                if (isOpponentMove) {
                  styles[lastMoveSquares.from] = { background: 'rgba(255, 69, 58, 0.07)' };
                  styles[lastMoveSquares.to]   = { background: 'rgba(255, 69, 58, 0.12)' };
                } else {
                  styles[lastMoveSquares.from] = { background: 'rgba(0, 229, 255, 0.04)' };
                  styles[lastMoveSquares.to]   = { background: 'rgba(0, 229, 255, 0.08)' };
                }
              }

              // Recommendation highlights
              if (recommendationHighlights && recommendationHighlights.length >= 2) {
                const [fromSq, toSq] = recommendationHighlights;
                styles[fromSq] = { ...styles[fromSq], background: 'rgba(0, 229, 255, 0.22)' };
                styles[toSq] = { ...styles[toSq], background: 'rgba(0, 229, 255, 0.38)' };
              }

              return styles;
            }, [lastMoveSquares, recommendationHighlights, chess])}
          />
        </div>
      </div>

      {/* Coach Panel — Collapsible on mobile so it doesn't block the board */}
      {isCoachOpen ? (
        <div className="absolute bottom-3 right-2 left-2 sm:bottom-6 sm:right-6 sm:left-auto z-40 sm:w-[340px] pointer-events-auto max-h-[158px] sm:max-h-none">
          <div className="bg-black/70 backdrop-blur-2xl border border-[#00e5ff]/20 rounded-2xl p-3 sm:p-5 text-sm shadow-2xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-1.5 sm:mb-3 px-1">
              <div className="text-[8px] sm:text-[10px] tracking-[2px] text-[#00e5ff]/70 font-medium">LIVE COACH</div>
              <div className="flex items-center gap-2">
                <div className={`text-[8px] sm:text-[10px] px-2 py-0.5 rounded-full border ${isThinking ? 'border-[#00e5ff]/40 text-[#00e5ff]' : 'border-white/10 text-white/50'}`}>
                  {isThinking ? 'THINKING' : 'OBSERVING'}
                </div>
                {/* Collapse button - only visible on mobile */}
                <button 
                  onClick={() => setIsCoachOpen(false)} 
                  className="sm:hidden flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition"
                  aria-label="Hide coach"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable insights area - limited height on mobile, latest on top */}
            <div className="flex-1 overflow-y-auto pr-1 text-[11.5px] sm:text-[13.5px] leading-relaxed space-y-2 min-h-0 max-h-[92px]">
              <AnimatePresence>
                {coachInsights.slice().reverse().slice(0, 5).map((insight) => {
                  const displayText = insight.text || insight.fullText || '';
                  const [headline, ...whyParts] = displayText.split('\n\nWhy:');
                  const whyText = whyParts.join('\n\nWhy:');
                  return (
                  <motion.div key={insight.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[#c8c8d0]">
                    {headline}
                    {whyText && (
                      <div className="mt-1 sm:mt-2 pl-2.5 border-l border-[#00e5ff]/40 text-[10px] sm:text-[12px] text-[#a0a0aa]">
                        {whyText.split('\n\n')[0]}
                      </div>
                    )}
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <div className="text-[8px] sm:text-[10px] text-white/40 mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-white/10 tracking-wide">
              Strongest move shown automatically after every turn.
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed coach pill on mobile */
        <div className="absolute bottom-3 right-3 z-40 pointer-events-auto sm:hidden">
          <button
            onClick={() => setIsCoachOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-xl border border-[#00e5ff]/30 text-[#00e5ff] text-xs active:bg-black/80 transition"
          >
            LIVE COACH
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Game status — centered on top of the board on mobile */}
      <div className="absolute z-50 text-white/50 tracking-[1.5px] font-mono text-[10px] text-center
        top-[70px] left-1/2 -translate-x-1/2 sm:text-xs sm:bottom-6 sm:top-auto sm:left-6 sm:-translate-x-0 sm:text-left">
        {isThinking ? 'OPPONENT CALCULATING...' : chess.turn() === 'w' ? 'YOUR MOVE' : 'AI MOVE'} • {DIFFICULTY_CONFIG[difficulty].label.toUpperCase()}
      </div>

      <AnimatePresence>
        {isGameOver && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-2xl">
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="text-center">
              <div className="text-[42px] font-semibold tracking-[-1.5px] text-white mb-2">
                {gameStatus === 'white-wins' && "You won."}
                {gameStatus === 'black-wins' && "AI wins."}
                {gameStatus === 'draw' && "Draw."}
              </div>
              <p className="text-white/50 mb-8 max-w-xs mx-auto">
                {gameStatus === 'white-wins' && "Exceptional play."}
                {gameStatus === 'black-wins' && "The engine found the line."}
                {gameStatus === 'draw' && "Solid defense."}
              </p>
              <button onClick={() => resetGame()} className="px-10 py-3.5 rounded-full bg-white text-black font-medium text-sm tracking-wider">
                PLAY AGAIN
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer — visible on mobile only when coach is collapsed */}
      <div className={`absolute bottom-0 inset-x-0 z-30 flex justify-center pb-1 pointer-events-auto
        ${isCoachOpen ? 'hidden sm:flex' : 'flex sm:flex'}`}>
        <div className="flex items-center gap-x-2 text-[9px] text-white/70 tracking-[0.5px] px-4 sm:px-0">
          <a
            href="https://github.com/saadkamal/GrokChess"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GITHUB
          </a>
          <span className="text-white/30">•</span>
          <span>MIT</span>
          <span className="text-white/30">•</span>
          <span>Built by Saad Kamal with xAI's Grok 4.3</span>
        </div>
      </div>
    </div>
  );
}

export default App;