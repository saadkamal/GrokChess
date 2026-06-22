import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { makeSquare, moveAnimationFor, piecesFromFen, squareToPosition } from './chessBoard3DUtils';

describe('3D chess board helpers', () => {
  it('maps white-oriented board squares to stable world coordinates', () => {
    expect(squareToPosition('a1')).toEqual([-3.5, 0, 3.5]);
    expect(squareToPosition('h1')).toEqual([3.5, 0, 3.5]);
    expect(squareToPosition('a8')).toEqual([-3.5, 0, -3.5]);
    expect(squareToPosition('h8')).toEqual([3.5, 0, -3.5]);
    expect(squareToPosition('e4')).toEqual([0.5, 0, 0.5]);
  });

  it('builds valid chess squares from file/rank coordinates', () => {
    expect(makeSquare(0, 1)).toBe('a1');
    expect(makeSquare(4, 4)).toBe('e4');
    expect(makeSquare(7, 8)).toBe('h8');
  });

  it('extracts pieces from FEN with deterministic square ids', () => {
    const pieces = piecesFromFen('8/8/8/8/4P3/8/8/4k2K w - - 0 1');
    expect(pieces).toEqual(expect.arrayContaining([
      { id: 'wp-e4', square: 'e4', code: 'wp' },
      { id: 'bk-e1', square: 'e1', code: 'bk' },
      { id: 'wk-h1', square: 'h1', code: 'wk' },
    ]));
  });

  it('plans animation for the moved piece after a normal move', () => {
    const chess = new Chess();
    const move = chess.move({ from: 'e2', to: 'e4' }) as Move;
    expect(moveAnimationFor({ id: 'wp-e4', square: 'e4', code: 'wp' }, move)).toEqual({ from: 'e2', to: 'e4' });
    expect(moveAnimationFor({ id: 'wn-g1', square: 'g1', code: 'wn' }, move)).toBeNull();
  });

  it('plans rook animation for castling moves', () => {
    const kingSide = { color: 'w', from: 'e1', to: 'g1', flags: 'k' } as Move;
    const queenSide = { color: 'w', from: 'e1', to: 'c1', flags: 'q' } as Move;

    expect(moveAnimationFor({ id: 'wr-f1', square: 'f1' as Square, code: 'wr' }, kingSide)).toEqual({ from: 'h1', to: 'f1' });
    expect(moveAnimationFor({ id: 'wr-d1', square: 'd1' as Square, code: 'wr' }, queenSide)).toEqual({ from: 'a1', to: 'd1' });
  });
});
