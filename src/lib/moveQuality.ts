import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { evaluatePosition, getBestMove } from './chessLogic';

export type MoveQuality = 'best' | 'brilliant' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type MoveQualityAnalysis = {
  quality: MoveQuality;
  centipawnLoss: number;
  bestMove?: {
    san: string;
    from: Square;
    to: Square;
    promotion?: 'q' | 'r' | 'b' | 'n';
  };
  playedEval: number;
  bestEval: number;
  summary: string;
};

function applyMove(chess: Chess, move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): Move | null {
  try {
    return chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  } catch {
    return null;
  }
}

export function classifyCentipawnLoss(loss: number): MoveQuality {
  if (loss <= 12) return 'best';
  if (loss <= 35) return 'great';
  if (loss <= 80) return 'good';
  if (loss <= 150) return 'inaccuracy';
  if (loss <= 300) return 'mistake';
  return 'blunder';
}

export function qualityLabel(quality: MoveQuality): string {
  const labels: Record<MoveQuality, string> = {
    best: 'Best',
    brilliant: 'Brilliant',
    great: 'Great',
    good: 'Good',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
  };
  return labels[quality];
}

export function qualityTone(quality: MoveQuality): string {
  const tones: Record<MoveQuality, string> = {
    best: 'Excellent — you matched the coach\'s preferred move.',
    brilliant: 'Brilliant — this is a strong and hard-to-find idea.',
    great: 'Great move — you kept almost all of the position\'s potential.',
    good: 'Good move — your position stays healthy.',
    inaccuracy: 'Slight inaccuracy — there was a cleaner way to improve your position.',
    mistake: 'Mistake — this gives the opponent a meaningful chance.',
    blunder: 'Blunder — this likely gives away material or a major advantage.',
  };
  return tones[quality];
}

export function analyzePlayerMoveQuality(
  fenBeforeMove: string,
  playedMove: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' },
  depth = 2,
): MoveQualityAnalysis | null {
  const before = new Chess(fenBeforeMove);
  const mover = before.turn();
  const best = getBestMove(fenBeforeMove, depth);
  if (!best) return null;

  const playedPosition = new Chess(fenBeforeMove);
  const appliedPlayed = applyMove(playedPosition, playedMove);
  if (!appliedPlayed) return null;

  const bestPosition = new Chess(fenBeforeMove);
  const appliedBest = applyMove(bestPosition, best);
  if (!appliedBest) return null;

  const playedEval = evaluatePosition(playedPosition);
  const bestEval = evaluatePosition(bestPosition);
  const centipawnLoss = mover === 'w'
    ? Math.max(0, bestEval - playedEval)
    : Math.max(0, playedEval - bestEval);
  const sameMove = best.from === playedMove.from
    && best.to === playedMove.to
    && (best.promotion ?? undefined) === (playedMove.promotion ?? undefined);
  const rawQuality = classifyCentipawnLoss(centipawnLoss);
  const quality = sameMove ? 'best' : rawQuality === 'best' ? 'great' : rawQuality;
  const lossInPawns = Math.round((centipawnLoss / 100) * 10) / 10;

  let summary = qualityTone(quality);
  if (!sameMove && centipawnLoss > 35) {
    summary += ` The coach preferred ${appliedBest.san}, which evaluates about ${lossInPawns.toFixed(1)} pawn${lossInPawns === 1 ? '' : 's'} better.`;
  } else if (!sameMove) {
    summary += ` The coach also liked ${appliedBest.san}, but your choice is very close.`;
  }

  return {
    quality,
    centipawnLoss,
    bestMove: {
      san: appliedBest.san,
      from: best.from,
      to: best.to,
      promotion: best.promotion,
    },
    playedEval,
    bestEval,
    summary,
  };
}
