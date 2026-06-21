import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  buildCoachRecommendationText,
  describeRecommendationMove,
  explainRecommendation,
} from './coachText';

describe('coachText', () => {
  it('describes moves with from and to squares, not verbose file lectures', () => {
    const chess = new Chess();
    const text = describeRecommendationMove(chess, { from: 'e2', to: 'e4' });
    expect(text).toContain('pawn');
    expect(text).toContain('E2');
    expect(text).toContain('E4');
    expect(text).not.toContain('leftmost file');
  });

  it('warns when a recommended piece lands undefended', () => {
    // e5 pawn hits d4 if the knight jumps there
    const chess = new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    const why = explainRecommendation(chess, { from: 'f3', to: 'd4' });
    expect(why.toLowerCase()).toMatch(/careful|attacked|undefended|no backup|free piece/);
  });

  it('includes engine eval when provided', () => {
    const chess = new Chess();
    const why = explainRecommendation(chess, { from: 'e2', to: 'e4' }, { eval: 0.6 });
    expect(why).toContain('0.6');
  });

  it('describes mate scores without showing synthetic evals', () => {
    const chess = new Chess();
    const why = explainRecommendation(chess, { from: 'e2', to: 'e4' }, { eval: 999.9, mate: 2 });
    expect(why).toContain('forced mate');
    expect(why).toContain('2 moves');
    expect(why).not.toContain('999.9');
  });

  it('uses the actual opponent color in contested-square text', () => {
    const chess = new Chess('4k3/8/8/8/4pn2/8/2P5/4K3 b - - 0 1');
    const why = explainRecommendation(chess, { from: 'f4', to: 'd3' });
    expect(why).toContain('White can still capture');
  });

  it('builds a full recommendation block', () => {
    const chess = new Chess();
    const text = buildCoachRecommendationText(chess, { from: 'e2', to: 'e4' }, { eval: 0.3 });
    expect(text).toContain('I recommend');
    expect(text).toContain('Why:');
  });
});
