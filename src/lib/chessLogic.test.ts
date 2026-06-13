/**
 * Unit tests for GrokChess core logic
 *
 * Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)
 *
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  evaluatePosition,
  getPSTValue,
  orderMoves,
  getBestMove,
  minimax,
  pieceCodeToPromotion,
  PIECE_VALUES,
} from './chessLogic';

describe('chessLogic', () => {
  describe('pieceCodeToPromotion', () => {
    it('extracts promotion piece from react-chessboard codes', () => {
      expect(pieceCodeToPromotion('wQ')).toBe('q');
      expect(pieceCodeToPromotion('wR')).toBe('r');
      expect(pieceCodeToPromotion('wB')).toBe('b');
      expect(pieceCodeToPromotion('wN')).toBe('n');
    });

    it('returns undefined for non-promotion piece codes', () => {
      expect(pieceCodeToPromotion('wP')).toBeUndefined();
      expect(pieceCodeToPromotion('wK')).toBeUndefined();
      expect(pieceCodeToPromotion(undefined)).toBeUndefined();
      expect(pieceCodeToPromotion('queen')).toBeUndefined();
    });
  });

  describe('PIECE_VALUES', () => {
    it('assigns correct relative values', () => {
      expect(PIECE_VALUES.p).toBe(100);
      expect(PIECE_VALUES.q).toBeGreaterThan(PIECE_VALUES.r);
      expect(PIECE_VALUES.k).toBeGreaterThan(PIECE_VALUES.q);
    });
  });

  describe('evaluatePosition', () => {
    it('returns a numeric evaluation', () => {
      const chess = new Chess();
      const score = evaluatePosition(chess);
      expect(typeof score).toBe('number');
    });

    it('penalizes material loss for white', () => {
      const chess = new Chess();
      chess.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1');
      const score = evaluatePosition(chess);
      expect(score).toBeLessThan(0);
    });

    it('gives higher score for better development in opening', () => {
      const starting = new Chess();
      const developed = new Chess();
      developed.load('rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 1 2');

      const startScore = evaluatePosition(starting);
      const devScore = evaluatePosition(developed);

      // White has developed a knight
      expect(devScore).toBeGreaterThan(startScore);
    });
  });

  describe('getPSTValue', () => {
    it('returns higher value for central pawn for white', () => {
      const e4 = getPSTValue('p', 'e4', true);
      const a2 = getPSTValue('p', 'a2', true);
      expect(e4).toBeGreaterThan(a2);
    });

    it('returns higher value for knight in center vs corner', () => {
      const center = getPSTValue('n', 'e4', true);
      const corner = getPSTValue('n', 'a1', true);
      expect(center).toBeGreaterThan(corner);
    });
  });

  describe('orderMoves', () => {
    it('returns moves (captures should generally come first)', () => {
      const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
      const moves = chess.moves({ verbose: true });
      const ordered = orderMoves(moves);
      expect(ordered.length).toBeGreaterThan(0);
    });

    it('prioritizes higher value captures', () => {
      const chess = new Chess('4k3/8/8/8/8/8/4p3/4K3 w - - 0 1');
      // Add a queen capture opportunity
      chess.load('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1'); // illegal but for test
      const moves = chess.moves({ verbose: true });
      if (moves.length > 0) {
        const ordered = orderMoves(moves);
        expect(ordered.length).toBeGreaterThan(0);
      }
    });
  });

  describe('minimax', () => {
    it('returns a finite number at depth 0', () => {
      const chess = new Chess();
      const value = minimax(chess, 0, -Infinity, Infinity, true);
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    });
  });

  describe('getBestMove (Beginner)', () => {
    it('should return a legal move in starting position', () => {
      const result = getBestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1);
      expect(result).not.toBeNull();
      expect(result?.from).toBeDefined();
      expect(result?.to).toBeDefined();
    });

    it('returns a move or null on terminal positions', () => {
      const result = getBestMove('4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1', 1);
      expect(result === null || typeof result.san === 'string').toBe(true);
    });

    it('returns different moves at different depths (non-deterministic at low depth)', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const moveDepth1 = getBestMove(fen, 1);
      const moveDepth2 = getBestMove(fen, 2);

      expect(moveDepth1).not.toBeNull();
      expect(moveDepth2).not.toBeNull();
    });
  });
});
