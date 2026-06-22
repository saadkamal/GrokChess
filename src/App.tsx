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
import { initStockfish, getBestMove as stockfishGetBestMove, resolveCoachRecommendation } from './lib/stockfishService';
import { evaluatePosition, getBestMove as getCustomBestMove, pieceCodeToPromotion } from './lib/chessLogic';
import { buildCoachRecommendationText } from './lib/coachText';
import { analyzePlayerMoveQuality, qualityLabel } from './lib/moveQuality';
import type { MoveQuality } from './lib/moveQuality';

import './App.css';

// Types
type Difficulty = 'easy' | 'medium' | 'hard';

interface MoveReviewEntry {
  moveNumber: number;
  san: string;
  quality: MoveQuality;
  centipawnLoss: number;
  summary: string;
  bestMoveSan?: string;
}

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

function qualityBadgeClass(quality: MoveQuality): string {
  const classes: Record<MoveQuality, string> = {
    best: 'border-[#00e5ff]/40 bg-[#00e5ff]/10 text-[#00e5ff]',
    brilliant: 'border-[#bf5af2]/40 bg-[#bf5af2]/10 text-[#d8a6ff]',
    great: 'border-[#30d158]/40 bg-[#30d158]/10 text-[#62e67f]',
    good: 'border-white/20 bg-white/10 text-white/75',
    inaccuracy: 'border-[#f1a10d]/40 bg-[#f1a10d]/10 text-[#ffd166]',
    mistake: 'border-[#f7630c]/40 bg-[#f7630c]/10 text-[#ff9f5a]',
    blunder: 'border-[#ff453a]/40 bg-[#ff453a]/10 text-[#ff7b72]',
  };
  return classes[quality];
}

function qualityScore(quality: MoveQuality): number {
  const scores: Record<MoveQuality, number> = {
    best: 100,
    brilliant: 100,
    great: 92,
    good: 82,
    inaccuracy: 65,
    mistake: 38,
    blunder: 12,
  };
  return scores[quality];
}

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

function getBeginnerMove(fen: string): EngineMove | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const allMoves = chess.moves({ verbose: true }) as Move[];
  if (Math.random() < 0.35) {
    const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];
    chess.move(randomMove);
    const evalScore = evaluatePosition(chess);
    chess.undo();
    return {
      san: randomMove.san,
      from: randomMove.from,
      to: randomMove.to,
      promotion: randomMove.promotion as PromotionPiece | undefined,
      eval: evalScore,
    };
  }

  return getCustomBestMove(fen, DIFFICULTY_CONFIG.easy.depth);
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

function getResponsiveBoardWidth(): number {
  if (typeof window === 'undefined') return 560;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (viewportWidth <= 900 && viewportHeight <= 520) {
    return Math.max(200, Math.floor(Math.min(viewportWidth * 0.44 - 16, viewportHeight * 0.58 - 16, 300)));
  }
  if (viewportWidth <= 380) {
    return Math.max(256, Math.floor(Math.min(viewportWidth * 0.92 - 16, viewportHeight * 0.52 - 16, 334)));
  }
  if (viewportWidth <= 900) {
    return Math.max(280, Math.floor(Math.min(viewportWidth * 0.92 - 16, viewportHeight * 0.56 - 16, 414)));
  }
  if (viewportWidth <= 1099) {
    return Math.max(420, Math.floor(Math.min(viewportHeight * 0.66 - 32, viewportWidth * 0.52 - 32, 560)));
  }
  return Math.max(480, Math.floor(Math.min(viewportHeight * 0.70 - 32, viewportWidth * 0.72 - 32, 668)));
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
    return getBeginnerMove(fen);
  }
  const skillMap = { medium: 13, hard: 20 };
  const timeMap = { medium: 950, hard: 2200 };
  const depthForHard = 18;

  try {
    const opts = difficulty === 'hard'
      ? { depth: depthForHard, multiPV: 3, timeoutMs: 4500 }
      : { movetime: timeMap[difficulty], multiPV: 1, timeoutMs: 2500 };
    const result = await stockfishGetBestMove(fen, skillMap[difficulty], opts);
    if (result?.bestMove) {
      const parsed = parseUciMove(result.bestMove);
      if (parsed) {
        return {
          san: '',
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
          eval: result.eval || 0,
          pv: result.pv,
        };
      }
    }
  } catch { console.warn('Stockfish call failed'); }

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
  const [moveReviews, setMoveReviews] = useState<MoveReviewEntry[]>([]);
  const [boardWidth, setBoardWidth] = useState(getResponsiveBoardWidth);

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
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Refs to cancel pending async work (prevents ghost moves, highlights, and coach text)
  const pendingAiMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecommendationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTakebackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameGenerationRef = useRef(0);
  const boardFenRef = useRef(fen);
  const completedPromotionDropRef = useRef<{ from: Square; to: Square; at: number } | null>(null);

  useEffect(() => {
    boardFenRef.current = fen;
  }, [fen]);

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

  const reviewSummary = useMemo(() => {
    if (moveReviews.length === 0) return null;
    const accuracy = Math.round(moveReviews.reduce((sum, item) => sum + qualityScore(item.quality), 0) / moveReviews.length);
    const worst = [...moveReviews].sort((a, b) => b.centipawnLoss - a.centipawnLoss)[0];
    const counts = moveReviews.reduce<Record<MoveQuality, number>>((acc, item) => {
      acc[item.quality] += 1;
      return acc;
    }, { best: 0, brilliant: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 });
    const hasTurningPoint = worst.centipawnLoss > 80;
    const learningTips = [
      counts.blunder || counts.mistake ? 'Slow down before captures and checks — most big swings come from loose pieces.' : 'Your tactical control was solid. Keep asking what your opponent threatens next.',
      counts.inaccuracy ? 'Look for candidate moves before committing; one quiet improving move is often better than the first legal idea.' : 'You avoided many small inaccuracies, which is a strong sign of improving consistency.',
      worst?.bestMoveSan ? `Revisit move ${worst.moveNumber}: the coach preferred ${worst.bestMoveSan}.` : 'Keep using the coach recommendation as a training target after each reply.',
    ];
    return { accuracy, worst, counts, learningTips, hasTurningPoint };
  }, [moveReviews]);

  useEffect(() => {
    initStockfish().catch(() => {
      // Stockfish failed to load — fallback to custom engine only
    });
  }, []);

  useEffect(() => {
    const handleResize = () => setBoardWidth(getResponsiveBoardWidth());
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const applyCoachRecommendation = useCallback(async (
    fen: string,
    generation: number,
    createdAtMove: number,
    loadingId?: number,
  ) => {
    const isActive = () => gameGenerationRef.current === generation && boardFenRef.current === fen;

    if (!isActive()) return;

    let analysis = await resolveCoachRecommendation(fen);
    if (!isActive()) return;

    if (!analysis?.bestMove || analysis.bestMove === '(none)') {
      const custom = getCustomBestMove(fen, 3);
      if (custom) {
        analysis = {
          bestMove: `${custom.from}${custom.to}${custom.promotion ?? ''}`,
          eval: custom.eval / 100,
        };
      }
    }

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
      { eval: analysis.eval, mate: analysis.mate, multiPV: analysis.multiPV },
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
    completedPromotionDropRef.current = null;
    clearPendingTimers();
    chess.reset();
    setFen(chess.fen());
    setBoardRenderKey((k) => k + 1);
    setMoveHistory([]);
    setMoveReviews([]);
    setIsReviewOpen(false);
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
    const fenBeforePlayerMove = chess.fen();
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
    const qualityAnalysis = analyzePlayerMoveQuality(fenBeforePlayerMove, {
      from: move.from,
      to: move.to,
      promotion: move.promotion as PromotionPiece | undefined,
    }, difficulty === 'easy' ? 1 : 2);
    if (qualityAnalysis) {
      insight.quality = qualityAnalysis.quality;
      insight.text = `${qualityAnalysis.summary}\n\n${insight.text}`;
      insight.highlightedSquares = qualityAnalysis.bestMove && qualityAnalysis.quality !== 'best'
        ? [qualityAnalysis.bestMove.from, qualityAnalysis.bestMove.to]
        : insight.highlightedSquares;
      setMoveReviews((prev) => [...prev, {
        moveNumber: Math.ceil(newHistory.length / 2),
        san: move.san,
        quality: qualityAnalysis.quality,
        centipawnLoss: qualityAnalysis.centipawnLoss,
        summary: qualityAnalysis.summary,
        bestMoveSan: qualityAnalysis.bestMove?.san,
      }]);
    }
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
          const rolledBackHistory = newHistory.slice(0, -1);
          chess.undo();
          setFen(chess.fen());
          setMoveHistory(rolledBackHistory);
          setMoveReviews((prev) => prev.filter((review) => review.moveNumber * 2 - 1 <= rolledBackHistory.length));
          setLastMoveSquares(rolledBackHistory.length > 0
            ? { from: rolledBackHistory[rolledBackHistory.length - 1].from, to: rolledBackHistory[rolledBackHistory.length - 1].to }
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
          const rolledBackHistory = newHistory.slice(0, -1);
          replayMoveHistory(chess, rolledBackHistory);
          toast.error('AI could not respond — your move was undone.');
          setFen(chess.fen());
          setMoveHistory(rolledBackHistory);
          setMoveReviews((prev) => prev.filter((review) => review.moveNumber * 2 - 1 <= rolledBackHistory.length));
          setLastMoveSquares(rolledBackHistory.length > 0
            ? { from: rolledBackHistory[rolledBackHistory.length - 1].from, to: rolledBackHistory[rolledBackHistory.length - 1].to }
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
    const completedPromotionDrop = completedPromotionDropRef.current;
    if (
      completedPromotionDrop
      && completedPromotionDrop.from === sourceSquare
      && completedPromotionDrop.to === targetSquare
      && Date.now() - completedPromotionDrop.at < 2500
    ) {
      completedPromotionDropRef.current = null;
      return true;
    }

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
    const moved = makeMove(promoteFromSquare, promoteToSquare, promotion);
    if (moved) {
      completedPromotionDropRef.current = { from: promoteFromSquare, to: promoteToSquare, at: Date.now() };
    }
    return moved;
  }, [makeMove]);

  const takeBack = useCallback(() => {
    if (moveHistory.length === 0 || isThinking) return;
    gameGenerationRef.current += 1;
    completedPromotionDropRef.current = null;
    clearPendingTimers();

    const movesToUndo = Math.min(2, moveHistory.length);
    const newHistory = moveHistory.slice(0, -movesToUndo);
    replayMoveHistory(chess, newHistory);
    const newFen = chess.fen();
    setFen(newFen);
    setBoardRenderKey((k) => k + 1);
    setMoveHistory(newHistory);
    setMoveReviews((prev) => prev.filter((review) => review.moveNumber * 2 - 1 <= newHistory.length));
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
    <div className="grok-app h-[100dvh] w-screen overflow-hidden bg-[#020206] text-[#c8c8d0] font-sans pb-[env(safe-area-inset-bottom)]">
      <div className="grok-ambient" aria-hidden="true">
        <div className="grok-ambient__orb grok-ambient__orb--cyan" />
        <div className="grok-ambient__orb grok-ambient__orb--violet" />
        <div className="grok-ambient__grid" />
      </div>

      {/* Top bar — desktop command deck, mobile two-row cockpit */}
      <div className="gc-topbar pointer-events-none">
        <div className="gc-brand pointer-events-auto">
          <div className="gc-brand__mark">G</div>
          <div>
            <div className="gc-brand__title">GROKCHESS</div>
            <div className="gc-brand__subtitle">Premium AI chess trainer</div>
          </div>
        </div>

        <div className="gc-difficulty pointer-events-auto" aria-label="Difficulty selector">
          {DIFFICULTIES.map((d) => {
            const cfg = DIFFICULTY_CONFIG[d];
            const active = d === difficulty;
            return (
              <button
                key={d}
                onClick={() => changeDifficulty(d)}
                aria-pressed={active}
                className={`gc-difficulty__button ${active ? 'gc-difficulty__button--active' : ''}`}
              >
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <div className="gc-actions pointer-events-auto">
          <button onClick={takeBack} disabled={moveHistory.length === 0 || isThinking} className="gc-action-btn" aria-label="Take back move">
            <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">TAKE BACK</span>
          </button>
          <button onClick={() => setIsReviewOpen(true)} disabled={moveReviews.length === 0} className="gc-action-btn gc-action-btn--accent" aria-label="Open game review">
            <span className="sm:hidden">REV</span><span className="hidden sm:inline">REVIEW</span>
          </button>
          <button onClick={() => resetGame()} className="gc-action-btn gc-action-btn--danger" aria-label="New game">
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">NEW</span>
          </button>
        </div>
      </div>

      {/* Premium 2D/3D board stage */}
      <div className={`gc-stage ${isCoachOpen ? 'gc-stage--coach-open' : ''}`}>
        <div className="gc-board-platform" aria-hidden="true" style={{ width: boardWidth + (boardWidth <= 414 ? 16 : 32) }}>
          <div className="gc-board-platform__rim" />
          <div className="gc-board-platform__well" />
          <div className="gc-board-platform__glow" />
        </div>

        <div className="gc-board-wrap" style={{ width: boardWidth + (boardWidth <= 414 ? 16 : 32), padding: boardWidth <= 414 ? 8 : 16 }}>
          <Chessboard
            key={boardRenderKey}
            position={fen}
            boardWidth={boardWidth}
            onPieceDrop={onPieceDrop}
            onPromotionPieceSelect={onPromotionPieceSelect}
            animationDuration={200}
            boardOrientation="white"
            arePiecesDraggable={!isGameOver && !isThinking && chess.turn() === 'w'}
            autoPromoteToQueen={false}

            customBoardStyle={{
              borderRadius: '18px',
              boxShadow: '0 28px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
              border: '1px solid rgba(148, 227, 255, 0.16)',
              overflow: 'hidden',
            }}
            customDarkSquareStyle={{ backgroundColor: '#0f1724' }}
            customLightSquareStyle={{ backgroundColor: '#7892a3' }}
            customDropSquareStyle={{ 
              boxShadow: 'inset 0 0 0 4px rgba(0,229,255,0.72), inset 0 0 36px rgba(0,229,255,0.22)',
              backgroundColor: 'rgba(0,229,255,0.12)'
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

      {/* Coach Panel — glass command card, bottom sheet on mobile */}
      {isCoachOpen ? (
        <div className="gc-coach-shell pointer-events-auto">
          <div className="gc-coach-card">
            <div className="flex items-center justify-between mb-1.5 sm:mb-3 px-1">
              <div className="gc-section-label">LIVE COACH</div>
              <div className="flex items-center gap-2">
                <div className={`gc-coach-state ${isThinking ? 'gc-coach-state--active' : ''}`}>
                  {isThinking ? 'THINKING' : 'OBSERVING'}
                </div>
                {/* Collapse button - only visible on mobile */}
                <button 
                  onClick={() => setIsCoachOpen(false)} 
                  className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition"
                  aria-label="Hide coach"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable insights area - limited height on mobile, latest on top */}
            <div className="gc-coach-feed">
              <AnimatePresence>
                {coachInsights.slice().reverse().slice(0, 5).map((insight) => {
                  const displayText = insight.text || insight.fullText || '';
                  const [headline, ...whyParts] = displayText.split('\n\nWhy:');
                  const whyText = whyParts.join('\n\nWhy:');
                  return (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="gc-insight-card"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      {insight.quality && (
                        <span className={`rounded-full border px-2 py-0.5 text-[8px] sm:text-[9px] font-semibold uppercase tracking-[1.2px] ${qualityBadgeClass(insight.quality)}`}>
                          {qualityLabel(insight.quality)}
                        </span>
                      )}
                      {insight.moveSan && (
                        <span className="font-mono text-[8px] sm:text-[9px] text-white/35">{insight.moveSan}</span>
                      )}
                    </div>
                    <div>{headline}</div>
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

            <div className="gc-coach-footer">
              Strongest move shown automatically after every turn.
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed coach pill on mobile */
        <div className="absolute bottom-4 right-4 z-40 pointer-events-auto sm:hidden">
          <button
            onClick={() => setIsCoachOpen(true)}
            className="gc-coach-pill"
          >
            LIVE COACH
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {isReviewOpen && reviewSummary && (
          <div className="gc-modal-backdrop">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Game review"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="gc-review-card"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-medium tracking-[2px] text-[#00e5ff]/70">GAME REVIEW</div>
                  <div className="mt-1 text-3xl font-semibold tracking-[-1px] text-white">Accuracy {reviewSummary.accuracy}%</div>
                  <p className="mt-1 text-sm text-white/50">A plain-English review of your decisions as White.</p>
                </div>
                <button onClick={() => setIsReviewOpen(false)} className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white">CLOSE</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {(['best', 'great', 'good', 'inaccuracy', 'mistake', 'blunder'] as MoveQuality[]).map((quality) => (
                  reviewSummary.counts[quality] > 0 && (
                    <div key={quality} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[1.2px] ${qualityBadgeClass(quality)}`}>{qualityLabel(quality)}</div>
                      <div className="mt-2 text-2xl font-semibold text-white">{reviewSummary.counts[quality]}</div>
                    </div>
                  )
                ))}
              </div>

              {reviewSummary.worst && (
                <div className={`mt-4 rounded-2xl border p-4 ${reviewSummary.hasTurningPoint ? 'border-[#ff453a]/20 bg-[#ff453a]/[0.045]' : 'border-[#00e5ff]/15 bg-[#00e5ff]/[0.04]'}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-[1.7px] ${reviewSummary.hasTurningPoint ? 'text-[#ff7b72]' : 'text-[#00e5ff]/70'}`}>
                    {reviewSummary.hasTurningPoint ? 'Turning point' : 'Clean game'}
                  </div>
                  <div className="mt-1 text-sm text-white/80">Move {reviewSummary.worst.moveNumber}: {reviewSummary.worst.san} — {reviewSummary.worst.summary}</div>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {reviewSummary.learningTips.map((tip, index) => (
                  <div key={tip} className="rounded-2xl border border-[#00e5ff]/15 bg-[#00e5ff]/[0.04] p-4 text-sm text-white/70">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-[#00e5ff]/70">Lesson {index + 1}</div>
                    {tip}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Game status */}
      <div className="gc-status" aria-live="polite">
        <span className="gc-status__dot" />
        {isThinking ? 'OPPONENT CALCULATING...' : chess.turn() === 'w' ? 'YOUR MOVE' : 'AI MOVE'} • {DIFFICULTY_CONFIG[difficulty].label.toUpperCase()}
      </div>

      <AnimatePresence>
        {isGameOver && (
          <div className="gc-modal-backdrop z-[70]">
            <motion.div role="dialog" aria-modal="true" aria-label="Game over" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="gc-gameover-card">
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
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={() => setIsReviewOpen(true)} disabled={!reviewSummary} className="gc-hero-btn gc-hero-btn--ghost">
                  REVIEW GAME
                </button>
                <button onClick={() => resetGame()} className="gc-hero-btn">
                  PLAY AGAIN
                </button>
              </div>
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