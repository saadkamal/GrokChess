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
import { initStockfish, getBestMove as stockfishGetBestMove, getFastAnalysis } from './lib/stockfishService';
import { getBestMove as getCustomBestMove } from './lib/chessLogic';

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

interface FastAnalysisResult {
  bestMove: string;
  eval?: number;
  pv?: string;
  multiPV?: Array<{ move: string; eval: number; pv: string }>;
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

async function getBestMoveSmart(fen: string, difficulty: Difficulty): Promise<{ san: string; from: Square; to: Square; eval: number; pv?: string } | null> {
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
        return { san: '', from: result.bestMove.slice(0, 2) as Square, to: result.bestMove.slice(2, 4) as Square, eval: result.eval || 0, pv: result.pv };
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

function describeMoveInPlainEnglish(move: { piece?: string; to: Square; san?: string }): string {
  let pieceType = move.piece;
  if (!pieceType && move.san) {
    const first = move.san[0];
    if (first >= 'A' && first <= 'Z') pieceType = first.toLowerCase();
  }
  if (!pieceType) pieceType = 'p';
  const toSquare = move.to.toUpperCase();
  const file = move.to[0];
  const rank = move.to[1];
  const fileNames: Record<string, string> = {
    a: "the leftmost file (a-file)", b: "the second file from the left (b-file)", c: "the third file from the left (c-file)",
    d: "the fourth file from the left (d-file, near the center)", e: "the fifth file from the left (e-file, near the center)",
    f: "the sixth file from the left (f-file)", g: "the seventh file from the left (g-file)", h: "the rightmost file (h-file)",
  };
  const rankDesc = parseInt(rank) <= 4 ? `rank ${rank} (closer to you as White)` : `rank ${rank}`;
  const squareDesc = `${fileNames[file] || file + '-file'}, ${rankDesc}`;
  if (pieceType === 'n') return `Move your knight to ${toSquare} — the square on ${squareDesc}.`;
  if (pieceType === 'b') return `Move your bishop to ${toSquare} — the square on ${squareDesc}.`;
  if (pieceType === 'r') return `Move your rook to ${toSquare} — the square on ${squareDesc}.`;
  if (pieceType === 'q') return `Move your queen to ${toSquare} — the square on ${squareDesc}.`;
  if (pieceType === 'k') return `Move your king to ${toSquare} — the square on ${squareDesc}.`;
  return `Push a pawn to ${toSquare} — the square on ${squareDesc}.`;
}

function getBetterMoveWhy(chess: Chess, rec: { from: Square; to: Square; san: string }): string {
  const before = new Chess(chess.fen());
  const piece = before.get(rec.from);
  if (!piece) return "This improves your position.";
  const isWhite = piece.color === 'w';
  const opponentColor = isWhite ? 'b' : 'w';
  const reasons: string[] = [];
  const targetOnArrival = chess.get(rec.to);
  if (targetOnArrival) reasons.push(`captures the ${getPieceFullName(targetOnArrival.type)} on ${rec.to}`);
  before.move({ from: rec.from, to: rec.to });
  if (['n', 'b', 'r', 'q'].includes(piece.type)) {
    const startingRank = isWhite ? '1' : '8';
    if (rec.from[1] === startingRank) reasons.push("develops a piece that was still on the back rank");
  }
  const central: Square[] = ['d4', 'd5', 'e4', 'e5'];
  const attacksCenter = central.filter(sq => before.isAttacked(sq, opponentColor)).length;
  if (attacksCenter >= 2) reasons.push("strongly controls the center");
  else if (attacksCenter === 1) reasons.push("helps control important central squares");
  if (rec.san.includes('+')) reasons.push("gives check and forces the opponent to respond");
  if (piece.type === 'k' && Math.abs(rec.from.charCodeAt(0) - rec.to.charCodeAt(0)) === 2) reasons.push("improves king safety by castling");
  if (reasons.length === 0) reasons.push("improves your piece activity and fights for the center");
  return "This " + reasons.join(" and ") + ".";
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
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | undefined>();
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

  // Ref to hold the pending recommendation timeout ID so we can cancel it on new moves (prevents ghosting)
  const pendingRecommendationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGameOver = gameStatus !== 'playing';

  useEffect(() => {
    initStockfish().catch(() => {
      // Stockfish failed to load — fallback to custom engine only
    });
  }, []);

  const resetGame = useCallback((newDifficulty?: Difficulty) => {
    const d = newDifficulty || difficulty;
    chess.reset();
    setFen(chess.fen());
    setMoveHistory([]);
    setLastMove(undefined);
    setGameStatus('playing');
    setIsThinking(false);
    setRecommendationHighlights(null);
    setLastMoveSquares(null);
    if (pendingRecommendationTimeoutRef.current) {
      clearTimeout(pendingRecommendationTimeoutRef.current);
      pendingRecommendationTimeoutRef.current = null;
    }
    setCoachInsights([{
      id: Date.now(),
      text: `New game — ${DIFFICULTY_CONFIG[d].label}. I will show the best move and explain exactly why after every turn.`,
      isPlayerMove: true,
      timestamp: new Date(),
    }]);
    if (newDifficulty) setDifficulty(d);
  }, [chess, difficulty]);

  const makeMove = useCallback((from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): boolean => {
    if (isGameOver || isThinking) return false;
    const move = chess.move({ from, to, promotion });
    if (!move) return false;

    const newFen = chess.fen();
    const newHistory = [...moveHistory, move];
    setFen(newFen);
    setMoveHistory(newHistory);
    setLastMove({ from: move.from, to: move.to });

    setRecommendationHighlights(null);
    setLastMoveSquares({ from: move.from, to: move.to });

    // Cancel any in-flight recommendation timer from the *previous* opponent move.
    // Cancel any pending recommendation timer so old suggestions don't leak after takeback
    if (pendingRecommendationTimeoutRef.current) {
      clearTimeout(pendingRecommendationTimeoutRef.current);
      pendingRecommendationTimeoutRef.current = null;
    }

    const insight = generateCoachInsight(chess, move, true, difficulty);
    insight.createdAtMove = newHistory.length;
    setCoachInsights(prev => [...prev, insight]);

    if (chess.isGameOver()) {
      const status = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black-wins' : 'white-wins') : 'draw';
      setGameStatus(status);
      return true;
    }

    setIsThinking(true);
    setTimeout(async () => {
      const aiResult = await getBestMoveSmart(chess.fen(), difficulty);
      if (aiResult) {
        let aiMove: Move | null = null;
        if (aiResult.san) aiMove = chess.move(aiResult.san);
        else if (aiResult.from && aiResult.to) aiMove = chess.move({ from: aiResult.from, to: aiResult.to });

        if (aiMove) {
          // Clear highlights before applying AI move to prevent visual ghosting during animation
          setLastMoveSquares(null);
          setRecommendationHighlights(null);

          const updatedFen = chess.fen();
          const updatedHistory = [...newHistory, aiMove];
          setFen(updatedFen);
          setMoveHistory(updatedHistory);
          setLastMove({ from: aiMove.from, to: aiMove.to });

          // Restore only the last-move red for Black on the next frame (rec cyan remains off until coach decides).
          requestAnimationFrame(() => {
            setLastMoveSquares({ from: aiMove.from, to: aiMove.to });
            // Extra belt-and-suspenders null for rec cyan in case any batched update was pending
            setRecommendationHighlights(null);
          });

          const aiInsight = generateCoachInsight(chess, aiMove, false, difficulty, false);
          aiInsight.createdAtMove = updatedHistory.length;
          setCoachInsights(prev => [...prev, aiInsight]);

          // Cancel any previous pending recommendation timeout
          if (pendingRecommendationTimeoutRef.current) {
            clearTimeout(pendingRecommendationTimeoutRef.current);
          }

          pendingRecommendationTimeoutRef.current = setTimeout(async () => {
            const fastAnalysisPromise = getFastAnalysis(chess.fen());
            const timeoutPromise = new Promise<FastAnalysisResult | null>((resolve) => setTimeout(() => resolve(null), 1800));
            let analysis: FastAnalysisResult | null = await Promise.race([fastAnalysisPromise, timeoutPromise]);

            if (!analysis?.bestMove) {
              const fallback = await getBestMoveSmart(chess.fen(), difficulty);
              if (fallback?.from && fallback?.to) {
                analysis = { bestMove: fallback.from + fallback.to, multiPV: [] };
              }
            }

            if (analysis?.bestMove && !chess.isGameOver()) {
              const fromSq = analysis.bestMove.slice(0, 2) as Square;
              const toSq = analysis.bestMove.slice(2, 4) as Square;
              const actualPiece = chess.get(fromSq)?.type;
              const targetPiece = chess.get(toSq);

              const rec = { from: fromSq, to: toSq, san: analysis.bestMove, piece: actualPiece };
              const plainEnglish = targetPiece 
                ? `Capture the ${getPieceFullName(targetPiece.type)} on ${toSq.toUpperCase()} with your ${getPieceFullName(actualPiece || 'p')}`
                : describeMoveInPlainEnglish(rec);

              const why = getBetterMoveWhy(chess, rec);
              const text = `I recommend ${plainEnglish}\n\nWHY THIS IS GOOD:\n${why}`;

              // Set the new recommendation (bright cyan).
              // At the same moment, clear the previous Black last-move red highlight.
              // Once the coach is actively telling you your next move, Black's just-played red should no longer be ghosting the board.
              setRecommendationHighlights([fromSq, toSq]);
              setLastMoveSquares(null);

              const suggestionInsight: CoachInsight = {
                id: Date.now() + 1,
                text: '',
                fullText: text,
                streaming: true,
                isPlayerMove: true,
                timestamp: new Date(),
                createdAtMove: updatedHistory.length,
              };
              setCoachInsights(prev => [...prev, suggestionInsight]);
            }

            pendingRecommendationTimeoutRef.current = null;
          }, 420);
        }
      }
      if (chess.isGameOver()) {
        const status = chess.isCheckmate() ? (chess.turn() === 'w' ? 'black-wins' : 'white-wins') : 'draw';
        setGameStatus(status);
      }
      setIsThinking(false);
    }, difficulty === 'hard' ? 650 : 420);

    return true;
  }, [chess, difficulty, moveHistory, isGameOver, isThinking]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square): boolean => {
    if (chess.turn() !== 'w') { toast.error("It's not your turn"); return false; }
    return makeMove(sourceSquare, targetSquare);
  }, [chess, makeMove]);

  const takeBack = useCallback(() => {
    if (moveHistory.length === 0 || isThinking) return;
    const movesToUndo = Math.min(2, moveHistory.length);
    for (let i = 0; i < movesToUndo; i++) chess.undo();
    const newHistory = moveHistory.slice(0, -movesToUndo);
    const newFen = chess.fen();
    setFen(newFen);
    setMoveHistory(newHistory);
    const restoredLast = newHistory.length > 0 ? { from: newHistory[newHistory.length-1].from, to: newHistory[newHistory.length-1].to } : undefined;
    setLastMove(restoredLast);
    void lastMove; // used for potential future UI (last move indicator)
    setLastMoveSquares(restoredLast || null);
    setGameStatus('playing');

    if (pendingRecommendationTimeoutRef.current) {
      clearTimeout(pendingRecommendationTimeoutRef.current);
      pendingRecommendationTimeoutRef.current = null;
    }

    // Prune coach history back to the position we landed on after the take-back.
    // Keep previous conversation instead of nuking the entire chat.
    // Then the code below will append a fresh recommendation for the new position.
    setCoachInsights(prev => {
      const targetMove = newHistory.length;

      return prev
        .filter(insight => {
          if (insight.id === 0) return true; // always keep the initial welcome
          if (typeof insight.createdAtMove === 'number') {
            return insight.createdAtMove <= targetMove;
          }
          // Old messages without createdAtMove (very early game) — keep them
          return true;
        })
        .map(insight => ({
          ...insight,
          streaming: false,
          fullText: undefined,
          highlightedSquares: undefined,
        }));
    });

    if (chess.turn() === 'w' && !isThinking) {
      setRecommendationHighlights(null);
      setTimeout(async () => {
        const recommendation = await getBestMoveSmart(chess.fen(), difficulty);
        if (recommendation?.from && recommendation?.to && !chess.isGameOver()) {
          const fromSq = recommendation.from;
          const toSq = recommendation.to;
          const actualPiece = chess.get(fromSq)?.type;
          const targetPiece = chess.get(toSq);
          const rec = { from: fromSq, to: toSq, san: recommendation.san || (fromSq + toSq), piece: actualPiece };
          const plainEnglish = targetPiece 
            ? `Capture the ${getPieceFullName(targetPiece.type)} on ${toSq.toUpperCase()} with your ${getPieceFullName(actualPiece || 'p')}`
            : describeMoveInPlainEnglish(rec);
          const why = getBetterMoveWhy(chess, rec);
          const txt = `I recommend ${plainEnglish}\n\nWHY THIS IS GOOD:\n${why}`;

          setRecommendationHighlights([fromSq, toSq]);
          setLastMoveSquares(null);   // same logic: when coach recommendation appears after takeback, clear any old last-move red

          const suggestion = {
            id: Date.now() + 1, text: '', fullText: txt, streaming: true, isPlayerMove: true,
            timestamp: new Date(), createdAtMove: newHistory.length,
          };
          setCoachInsights(prev => [...prev, suggestion]);
        }
      }, 200);
    }
    toast.success(`Took back ${movesToUndo} move${movesToUndo > 1 ? 's' : ''}`);
  }, [chess, moveHistory, isThinking, difficulty]);

  const changeDifficulty = (newDiff: Difficulty) => {
    if (newDiff === difficulty && moveHistory.length > 0) return;
    resetGame(newDiff);
    toast.success(`Switched to ${DIFFICULTY_CONFIG[newDiff].label}`);
  };



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
  }, [takeBack, resetGame]);

  // Streaming for recommendations
  useEffect(() => {
    const latest = [...coachInsights].reverse().find(i => i.streaming);
    if (!latest || !latest.fullText) return;
    const fullText = latest.fullText;
    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex += 3;
      const partial = fullText.slice(0, Math.min(currentIndex, fullText.length));
      setCoachInsights(prev => prev.map(insight => insight.id === latest.id ? { ...insight, text: partial } : insight));
      if (currentIndex >= fullText.length) {
        clearInterval(interval);
        setCoachInsights(prev => prev.map(insight => insight.id === latest.id ? { ...insight, streaming: false, text: fullText } : insight));
      }
    }, 18);
    return () => clearInterval(interval);
  }, [coachInsights.length]);

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
        ${isCoachOpen ? 'sm:items-center items-center pb-[130px] sm:pb-8' : 'items-center sm:pb-8'}`}>
        <div 
          className="relative holographic-platform"
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
        ${isCoachOpen ? 'sm:items-center items-center pb-[130px] sm:pb-8' : 'items-center sm:pb-8'}`}>
        <div className="relative" style={{ width: 'min(82vh, 86vw)', height: 'min(82vh, 86vw)' }}>
          <Chessboard
            position={fen}
            onPieceDrop={onPieceDrop}
            boardOrientation="white"
            arePiecesDraggable={!isGameOver && !isThinking && chess.turn() === 'w'}

            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: 'none',
            }}
            customDarkSquareStyle={{ backgroundColor: '#111117' }}
            customLightSquareStyle={{ backgroundColor: '#1a1a22' }}
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
                {coachInsights.slice().reverse().slice(0, 5).map((insight) => (
                  <motion.div key={insight.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[#c8c8d0]">
                    {insight.text.split('\n\nWHY THIS IS GOOD:')[0]}
                    {insight.text.includes('WHY THIS IS GOOD') && (
                      <div className="mt-1 sm:mt-2 pl-2.5 border-l border-[#00e5ff]/40 text-[10px] sm:text-[12px] text-[#a0a0aa]">
                        {insight.text.split('\n\nWHY THIS IS GOOD:')[1]?.split('\n\n')[0]}
                      </div>
                    )}
                  </motion.div>
                ))}
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
        top-[72px] left-1/2 -translate-x-1/2 sm:text-xs sm:bottom-6 sm:top-auto sm:left-6 sm:-translate-x-0 sm:text-left">
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