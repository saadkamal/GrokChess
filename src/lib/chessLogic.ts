/**
 * Pure chess logic utilities for GrokChess
 *
 * Contains evaluation, move ordering, and minimax search used by the Beginner level.
 *
 * Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)
 *
 * @license MIT
 */

import { Chess } from 'chess.js';
import type { Square, Move } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** react-chessboard promotion dialog passes piece codes like "wQ", not "q". */
export function pieceCodeToPromotion(pieceCode?: string): PromotionPiece | undefined {
  if (!pieceCode || pieceCode.length !== 2) return undefined;
  const promo = pieceCode[1].toLowerCase();
  if (promo === 'q' || promo === 'r' || promo === 'b' || promo === 'n') return promo;
  return undefined;
}

export const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

export const PST: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,0,5,5,5,5,0,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

export function getPSTValue(piece: string, square: Square, isWhite: boolean): number {
  const table = PST[piece.toLowerCase()];
  if (!table) return 0;
  let idx = square.charCodeAt(1) - 49;
  idx = 7 - idx;
  let file = square.charCodeAt(0) - 97;
  if (!isWhite) { idx = 7 - idx; file = 7 - file; }
  return table[idx * 8 + file];
}

export function evaluatePosition(chess: Chess): number {
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

export function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const aCapture = a.captured ? PIECE_VALUES[a.captured] : 0;
    const bCapture = b.captured ? PIECE_VALUES[b.captured] : 0;
    return bCapture - aCapture;
  });
}

export function minimax(chess: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
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

export function getBestMove(
  fen: string,
  depth: number,
): { san: string; from: Square; to: Square; promotion?: PromotionPiece; eval: number } | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const allMoves = chess.moves({ verbose: true }) as Move[];
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
  return {
    san: bestMove.san,
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion as PromotionPiece | undefined,
    eval: bestValue,
  };
}
