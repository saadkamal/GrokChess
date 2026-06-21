/**
 * Plain-English coaching copy for move recommendations.
 * Uses chess.js for tactical checks; engine eval is passed in from Stockfish.
 */

import { Chess } from 'chess.js';
import type { Square, Color } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type CoachRecommendation = {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
};

export type CoachAnalysisContext = {
  /** White-relative engine evaluation in pawns. Positive means White is better. */
  eval?: number;
  /** White-relative mate distance. Positive means White mates; negative means Black mates. */
  mate?: number;
  multiPV?: Array<{ move: string; eval: number; pv: string; mate?: number }>;
};

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function pieceName(piece: string): string {
  return PIECE_NAMES[piece] || 'piece';
}

function simulateMove(chess: Chess, rec: CoachRecommendation): Chess | null {
  const trial = new Chess(chess.fen());
  try {
    trial.move({ from: rec.from, to: rec.to, promotion: rec.promotion ?? 'q' });
    return trial;
  } catch {
    return null;
  }
}

function countCenterControl(chess: Chess, color: Color): number {
  const central: Square[] = ['d4', 'd5', 'e4', 'e5'];
  return central.filter((sq) => chess.isAttacked(sq, color)).length;
}

/** Short, direct move description — no long file/rank lectures. */
export function describeRecommendationMove(chess: Chess, rec: CoachRecommendation): string {
  const piece = chess.get(rec.from);
  if (!piece) return 'play the strongest move here';

  const name = pieceName(piece.type);
  const from = rec.from.toUpperCase();
  const to = rec.to.toUpperCase();
  const target = chess.get(rec.to);

  if (target && target.color !== piece.color) {
    return `capture the ${pieceName(target.type)} on ${to} with your ${name} from ${from}`;
  }
  if (rec.promotion) {
    return `advance your pawn from ${from} to ${to} and promote to a ${pieceName(rec.promotion)}`;
  }
  return `move your ${name} from ${from} to ${to}`;
}

function formatEval(evalScore?: number, mate?: number): string | null {
  if (mate !== undefined && !Number.isNaN(mate)) {
    const moves = Math.abs(mate);
    return mate > 0
      ? `The engine sees a forced mate for you in ${moves} move${moves === 1 ? '' : 's'} if you stay accurate.`
      : `The engine sees a forced mate threat against you in ${moves} move${moves === 1 ? '' : 's'}, so this is urgent.`;
  }
  if (evalScore === undefined || Number.isNaN(evalScore)) return null;
  const rounded = Math.round(evalScore * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  if (rounded > 1.5) {
    return `The engine likes this at ${sign}${rounded} — you're clearly better if you follow up well.`;
  }
  if (rounded > 0.4) {
    return `The engine scores this at ${sign}${rounded} — a real edge for you.`;
  }
  if (rounded >= -0.4) {
    return `The engine scores this at ${sign}${rounded} — the position stays roughly balanced.`;
  }
  if (rounded >= -1.5) {
    return `The engine scores this at ${sign}${rounded} — you're a bit worse, so accuracy matters.`;
  }
  return `The engine scores this at ${sign}${rounded} — you're under pressure and need a resourceful reply.`;
}

function describeSquareSafety(
  afterMove: Chess,
  square: Square,
  movingColor: Color,
): string | null {
  const opponent: Color = movingColor === 'w' ? 'b' : 'w';
  if (!afterMove.isAttacked(square, opponent)) return null;

  const defended = afterMove.isAttacked(square, movingColor);
  const piece = afterMove.get(square);
  const label = piece ? pieceName(piece.type) : 'piece';
  const sq = square.toUpperCase();
  const opponentLabel = opponent === 'b' ? 'Black' : 'White';

  if (!defended) {
    return `Careful: your ${label} on ${sq} would be attacked with no backup — that's often a free piece unless you're setting up a tactic.`;
  }
  return `Note: ${sq} is contested — your ${label} is defended, but ${opponentLabel} can still capture there and trade material.`;
}

export function explainRecommendation(
  chess: Chess,
  rec: CoachRecommendation,
  analysis?: CoachAnalysisContext,
): string {
  const piece = chess.get(rec.from);
  if (!piece) return 'This is the engine\'s top choice in the position.';

  const after = simulateMove(chess, rec);
  if (!after) return 'This is the engine\'s top choice in the position.';

  const parts: string[] = [];
  const movingColor = piece.color;

  const safety = describeSquareSafety(after, rec.to, movingColor);
  if (safety) parts.push(safety);

  const target = chess.get(rec.to);
  if (target && target.color !== piece.color) {
    parts.push(`You win the ${pieceName(target.type)} on ${rec.to.toUpperCase()}.`);
  }

  if (after.isCheck()) {
    parts.push('You give check, so Black must respond immediately.');
  }

  if (['n', 'b', 'r', 'q'].includes(piece.type)) {
    const startRank = movingColor === 'w' ? '1' : '8';
    if (rec.from[1] === startRank) {
      parts.push('You develop a piece that was still sitting on the back rank.');
    }
  }

  const centerGain = countCenterControl(after, movingColor) - countCenterControl(chess, movingColor);
  if (centerGain >= 2) {
    parts.push('You take strong control of the center.');
  } else if (centerGain === 1) {
    parts.push('You increase your influence in the center.');
  }

  const evalLine = formatEval(analysis?.eval, analysis?.mate);
  if (evalLine) parts.push(evalLine);

  if (parts.length === 0) {
    parts.push('This is the engine\'s best move — it improves your piece activity and keeps your options open.');
  }

  return parts.join(' ');
}

export function buildCoachRecommendationText(
  chess: Chess,
  rec: CoachRecommendation,
  analysis?: CoachAnalysisContext,
): string {
  const moveLine = describeRecommendationMove(chess, rec);
  const why = explainRecommendation(chess, rec, analysis);
  return `I recommend you ${moveLine}.\n\nWhy: ${why}`;
}
