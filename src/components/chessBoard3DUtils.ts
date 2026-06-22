import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';

export type PieceCode = `${'w' | 'b'}${'p' | 'n' | 'b' | 'r' | 'q' | 'k'}`;

export type PieceOnBoard = {
  id: string;
  square: Square;
  code: PieceCode;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function squareToPosition(square: Square): [number, number, number] {
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return [fileIndex - 3.5, 0, 3.5 - (rank - 1)];
}

export function makeSquare(fileIndex: number, rank: number): Square {
  return `${files[fileIndex]}${rank}` as Square;
}

export function piecesFromFen(fen: string): PieceOnBoard[] {
  const game = new Chess(fen);
  const board = game.board();
  const pieces: PieceOnBoard[] = [];

  board.forEach((row, rowIndex) => {
    row.forEach((piece, fileIndex) => {
      if (!piece) return;
      const rank = 8 - rowIndex;
      const square = makeSquare(fileIndex, rank);
      pieces.push({
        id: `${piece.color}${piece.type}-${square}`,
        square,
        code: `${piece.color}${piece.type}` as PieceCode,
      });
    });
  });

  return pieces;
}

export function moveAnimationFor(piece: PieceOnBoard, lastMove: Move | undefined): { from: Square; to: Square } | null {
  if (!lastMove) return null;
  if (piece.square === lastMove.to) return { from: lastMove.from, to: lastMove.to };

  if (lastMove.flags.includes('k')) {
    if (piece.code === `${lastMove.color}r` && piece.square === (`f${lastMove.to[1]}` as Square)) {
      return { from: (`h${lastMove.to[1]}` as Square), to: piece.square };
    }
  }

  if (lastMove.flags.includes('q')) {
    if (piece.code === `${lastMove.color}r` && piece.square === (`d${lastMove.to[1]}` as Square)) {
      return { from: (`a${lastMove.to[1]}` as Square), to: piece.square };
    }
  }

  return null;
}
