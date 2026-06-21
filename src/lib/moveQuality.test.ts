import { describe, expect, it } from 'vitest';
import { analyzePlayerMoveQuality, classifyCentipawnLoss, qualityLabel } from './moveQuality';

describe('moveQuality', () => {
  it('classifies centipawn loss into readable buckets', () => {
    expect(classifyCentipawnLoss(0)).toBe('best');
    expect(classifyCentipawnLoss(30)).toBe('great');
    expect(classifyCentipawnLoss(70)).toBe('good');
    expect(classifyCentipawnLoss(120)).toBe('inaccuracy');
    expect(classifyCentipawnLoss(220)).toBe('mistake');
    expect(classifyCentipawnLoss(500)).toBe('blunder');
  });

  it('returns human labels', () => {
    expect(qualityLabel('best')).toBe('Best');
    expect(qualityLabel('blunder')).toBe('Blunder');
  });

  it('analyzes a legal player move', () => {
    const analysis = analyzePlayerMoveQuality(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { from: 'e2', to: 'e4' },
      1,
    );
    expect(analysis).not.toBeNull();
    expect(analysis?.quality).toBeDefined();
    expect(analysis?.summary.length).toBeGreaterThan(10);
  });
});
