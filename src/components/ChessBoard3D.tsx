import { Component, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import * as THREE from 'three';
import { makeSquare, moveAnimationFor, piecesFromFen, squareToPosition } from './chessBoard3DUtils';
import type { PieceCode, PieceOnBoard } from './chessBoard3DUtils';

type BoardMoveRequest = (from: Square, to: Square) => void;

export interface ChessBoard3DProps {
  fen: string;
  boardKey: number;
  disabled: boolean;
  lastMoveSquares: { from: Square; to: Square } | null;
  recommendationHighlights: Square[] | null;
  moveHistory: Move[];
  force2D?: boolean;
  onMove: BoardMoveRequest;
}

const whiteMaterial = new THREE.MeshStandardMaterial({ color: '#f4f7ff', roughness: 0.42, metalness: 0.18 });
const whiteTrimMaterial = new THREE.MeshStandardMaterial({ color: '#91f4ff', roughness: 0.3, metalness: 0.55, emissive: '#0c6472', emissiveIntensity: 0.14 });
const blackMaterial = new THREE.MeshStandardMaterial({ color: '#12131f', roughness: 0.38, metalness: 0.34 });
const blackTrimMaterial = new THREE.MeshStandardMaterial({ color: '#a85dff', roughness: 0.28, metalness: 0.62, emissive: '#34115f', emissiveIntensity: 0.22 });
const accentMaterial = new THREE.MeshStandardMaterial({ color: '#00e5ff', roughness: 0.22, metalness: 0.5, emissive: '#00bfe6', emissiveIntensity: 0.45 });
const targetMaterial = new THREE.MeshStandardMaterial({ color: '#35ffb8', transparent: true, opacity: 0.42, roughness: 0.2, metalness: 0.1, emissive: '#16c783', emissiveIntensity: 0.3 });
const selectedMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, roughness: 0.1, emissive: '#00e5ff', emissiveIntensity: 0.55 });

function RoundedBase({ color }: { color: 'w' | 'b' }) {
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]} material={color === 'w' ? whiteMaterial : blackMaterial}>
        <cylinderGeometry args={[0.33, 0.39, 0.16, 40]} />
      </mesh>
      <mesh castShadow position={[0, 0.19, 0]} material={trim}>
        <cylinderGeometry args={[0.25, 0.31, 0.09, 40]} />
      </mesh>
    </group>
  );
}

function Pawn({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.41, 0]} material={material}>
        <coneGeometry args={[0.2, 0.38, 32]} />
      </mesh>
      <mesh castShadow position={[0, 0.68, 0]} material={material}>
        <sphereGeometry args={[0.17, 32, 18]} />
      </mesh>
    </group>
  );
}

function Rook({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.48, 0]} material={material}>
        <cylinderGeometry args={[0.22, 0.26, 0.52, 8]} />
      </mesh>
      <mesh castShadow position={[0, 0.8, 0]} material={trim}>
        <cylinderGeometry args={[0.31, 0.27, 0.14, 8]} />
      </mesh>
      {[-0.2, 0, 0.2].map((x) => (
        <mesh key={x} castShadow position={[x, 0.92, -0.18]} material={material}>
          <boxGeometry args={[0.11, 0.14, 0.12]} />
        </mesh>
      ))}
      {[-0.2, 0, 0.2].map((x) => (
        <mesh key={`b-${x}`} castShadow position={[x, 0.92, 0.18]} material={material}>
          <boxGeometry args={[0.11, 0.14, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

function Knight({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.48, 0]} material={material}>
        <cylinderGeometry args={[0.22, 0.28, 0.42, 18]} />
      </mesh>
      <mesh castShadow position={[0.03, 0.76, -0.05]} rotation={[0.18, 0, -0.18]} material={material}>
        <capsuleGeometry args={[0.15, 0.34, 8, 18]} />
      </mesh>
      <mesh castShadow position={[0.09, 0.93, -0.18]} rotation={[0.45, 0, -0.16]} material={material}>
        <boxGeometry args={[0.22, 0.2, 0.34]} />
      </mesh>
      <mesh castShadow position={[0.03, 0.98, -0.34]} rotation={[0.7, 0, 0]} material={trim}>
        <coneGeometry args={[0.08, 0.22, 4]} />
      </mesh>
    </group>
  );
}

function Bishop({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.49, 0]} material={material}>
        <coneGeometry args={[0.2, 0.52, 36]} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]} material={material}>
        <sphereGeometry args={[0.19, 32, 18]} />
      </mesh>
      <mesh castShadow position={[0.08, 0.86, 0]} rotation={[0, 0, -0.62]} material={trim}>
        <boxGeometry args={[0.035, 0.32, 0.22]} />
      </mesh>
      <mesh castShadow position={[0, 1.02, 0]} material={trim}>
        <sphereGeometry args={[0.075, 24, 12]} />
      </mesh>
    </group>
  );
}

function Queen({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  const crown = [-0.22, -0.11, 0, 0.11, 0.22];
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.55, 0]} material={material}>
        <coneGeometry args={[0.24, 0.64, 36]} />
      </mesh>
      <mesh castShadow position={[0, 0.93, 0]} material={trim}>
        <cylinderGeometry args={[0.24, 0.18, 0.1, 36]} />
      </mesh>
      {crown.map((x, index) => (
        <mesh key={x} castShadow position={[x, 1.05 + (index === 2 ? 0.08 : 0), 0]} material={trim}>
          <sphereGeometry args={[index === 2 ? 0.07 : 0.055, 18, 10]} />
        </mesh>
      ))}
    </group>
  );
}

function King({ color }: { color: 'w' | 'b' }) {
  const material = color === 'w' ? whiteMaterial : blackMaterial;
  const trim = color === 'w' ? whiteTrimMaterial : blackTrimMaterial;
  return (
    <group>
      <RoundedBase color={color} />
      <mesh castShadow position={[0, 0.56, 0]} material={material}>
        <coneGeometry args={[0.23, 0.66, 36]} />
      </mesh>
      <mesh castShadow position={[0, 0.96, 0]} material={trim}>
        <sphereGeometry args={[0.14, 28, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0]} material={trim}>
        <boxGeometry args={[0.08, 0.32, 0.08]} />
      </mesh>
      <mesh castShadow position={[0, 1.24, 0]} material={trim}>
        <boxGeometry args={[0.26, 0.07, 0.07]} />
      </mesh>
    </group>
  );
}

function PieceModel({ code }: { code: PieceCode }) {
  const color = code[0] as 'w' | 'b';
  const type = code[1];
  switch (type) {
    case 'p': return <Pawn color={color} />;
    case 'n': return <Knight color={color} />;
    case 'b': return <Bishop color={color} />;
    case 'r': return <Rook color={color} />;
    case 'q': return <Queen color={color} />;
    case 'k': return <King color={color} />;
    default: return null;
  }
}

function AnimatedPiece({ piece, animation, onSelect }: { piece: PieceOnBoard; animation: { from: Square; to: Square } | null; onSelect: (square: Square) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(animation ? 0 : 1);
  const start = useMemo(() => animation ? squareToPosition(animation.from) : squareToPosition(piece.square), [animation, piece.square]);
  const end = useMemo(() => squareToPosition(piece.square), [piece.square]);
  const animationKey = animation ? `${animation.from}-${animation.to}-${piece.code}` : `${piece.square}-${piece.code}`;
  const animationKeyRef = useRef(animationKey);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (animationKeyRef.current !== animationKey) {
      animationKeyRef.current = animationKey;
      progressRef.current = animation ? 0 : 1;
    }

    const duration = animation ? 0.46 : 0;
    progressRef.current = duration ? Math.min(1, progressRef.current + delta / duration) : 1;
    const t = progressRef.current;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const lift = animation ? Math.sin(Math.PI * t) * 0.42 : 0;

    groupRef.current.position.set(
      THREE.MathUtils.lerp(start[0], end[0], ease),
      0.1 + lift,
      THREE.MathUtils.lerp(start[2], end[2], ease),
    );
    groupRef.current.rotation.y = (piece.code[0] === 'b' ? Math.PI : 0) + (animation ? Math.sin(Math.PI * t) * 0.08 : 0);
  });

  const initial = animation ? start : end;

  return (
    <group
      ref={groupRef}
      position={[initial[0], 0.1, initial[2]]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(piece.square);
      }}
    >
      <PieceModel code={piece.code} />
    </group>
  );
}

function BoardSquare({ square, isDark, selected, target, lastMove, recommendation, onSelect }: {
  square: Square;
  isDark: boolean;
  selected: boolean;
  target: boolean;
  lastMove: boolean;
  recommendation: boolean;
  onSelect: (square: Square) => void;
}) {
  const [x, , z] = squareToPosition(square);
  const squareMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDark ? '#17202b' : '#d7e1ea',
    roughness: 0.58,
    metalness: 0.18,
    emissive: lastMove ? '#063c4a' : recommendation ? '#0e3448' : '#000000',
    emissiveIntensity: lastMove ? 0.28 : recommendation ? 0.36 : 0,
  }), [isDark, lastMove, recommendation]);

  return (
    <group position={[x, 0, z]} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(square); }}>
      <mesh receiveShadow material={squareMaterial}>
        <boxGeometry args={[0.98, 0.12, 0.98]} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.075, 0]} material={selectedMaterial}>
          <boxGeometry args={[0.9, 0.025, 0.9]} />
        </mesh>
      )}
      {target && (
        <mesh position={[0, 0.105, 0]} material={targetMaterial}>
          <torusGeometry args={[0.25, 0.025, 12, 40]} />
        </mesh>
      )}
      {recommendation && (
        <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} material={accentMaterial}>
          <ringGeometry args={[0.36, 0.42, 42]} />
        </mesh>
      )}
    </group>
  );
}

function useBoardSelection(fen: string, disabled: boolean, onMove: BoardMoveRequest) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const game = useMemo(() => new Chess(fen), [fen]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare || disabled || game.turn() !== 'w') return [] as Square[];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map((move) => move.to);
  }, [disabled, game, selectedSquare]);

  const handleSquareSelect = useCallback((square: Square) => {
    if (disabled || game.turn() !== 'w') return;

    if (selectedSquare) {
      const legal = (game.moves({ square: selectedSquare, verbose: true }) as Move[]).some((move) => move.to === square);
      if (legal) {
        onMove(selectedSquare, square);
        setSelectedSquare(null);
        return;
      }
    }

    const piece = game.get(square);
    if (piece?.color === 'w') {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }, [disabled, game, onMove, selectedSquare]);

  return { game, selectedSquare, legalTargets, handleSquareSelect };
}

function BoardScene({ fen, disabled, lastMoveSquares, recommendationHighlights, moveHistory, onMove }: ChessBoard3DProps) {
  const { selectedSquare, legalTargets, handleSquareSelect } = useBoardSelection(fen, disabled, onMove);
  const pieces = useMemo(() => piecesFromFen(fen), [fen]);
  const lastMove = moveHistory[moveHistory.length - 1];

  return (
    <group>
      <group position={[0, -0.08, 0]}>
        <mesh receiveShadow position={[0, -0.06, 0]} material={new THREE.MeshStandardMaterial({ color: '#03050b', roughness: 0.46, metalness: 0.7 })}>
          <boxGeometry args={[9.2, 0.28, 9.2]} />
        </mesh>
        <mesh receiveShadow position={[0, 0.04, 0]} material={new THREE.MeshStandardMaterial({ color: '#07101a', roughness: 0.34, metalness: 0.52, emissive: '#002633', emissiveIntensity: 0.18 })}>
          <boxGeometry args={[8.35, 0.2, 8.35]} />
        </mesh>
      </group>

      {Array.from({ length: 8 }).flatMap((_, rankIndex) => (
        Array.from({ length: 8 }).map((__, fileIndex) => {
          const rank = rankIndex + 1;
          const square = makeSquare(fileIndex, rank);
          const isDark = (fileIndex + rankIndex) % 2 === 0;
          return (
            <BoardSquare
              key={square}
              square={square}
              isDark={isDark}
              selected={selectedSquare === square}
              target={legalTargets.includes(square)}
              lastMove={lastMoveSquares?.from === square || lastMoveSquares?.to === square}
              recommendation={Boolean(recommendationHighlights?.includes(square))}
              onSelect={handleSquareSelect}
            />
          );
        })
      ))}

      {pieces.map((piece) => (
        <AnimatedPiece
          key={`${piece.code}-${piece.square}`}
          piece={piece}
          animation={moveAnimationFor(piece, lastMove)}
          onSelect={handleSquareSelect}
        />
      ))}
    </group>
  );
}

const unicodePieces: Record<PieceCode, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

function isWebGlAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function prefersLowPower3D(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || window.matchMedia('(max-width: 720px)').matches;
}

class BoardErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function ChessBoardFallback2D({ fen, disabled, lastMoveSquares, recommendationHighlights, onMove }: ChessBoard3DProps) {
  const { game, selectedSquare, legalTargets, handleSquareSelect } = useBoardSelection(fen, disabled, onMove);

  return (
    <div className="grok-2d-fallback" role="grid" aria-label="2D chess board fallback">
      {Array.from({ length: 8 }).flatMap((_, rowIndex) => (
        Array.from({ length: 8 }).map((__, fileIndex) => {
          const rank = 8 - rowIndex;
          const square = makeSquare(fileIndex, rank);
          const piece = game.get(square);
          const code = piece ? `${piece.color}${piece.type}` as PieceCode : null;
          const isDark = (fileIndex + rank) % 2 === 0;
          const isTarget = legalTargets.includes(square);
          const isMarked = lastMoveSquares?.from === square || lastMoveSquares?.to === square || Boolean(recommendationHighlights?.includes(square));

          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              className={`grok-2d-square ${isDark ? 'dark' : 'light'} ${selectedSquare === square ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isMarked ? 'marked' : ''}`}
              onClick={() => handleSquareSelect(square)}
              disabled={disabled}
              aria-label={square}
            >
              {code && <span className={piece?.color === 'w' ? 'white-piece' : 'black-piece'}>{unicodePieces[code]}</span>}
            </button>
          );
        })
      ))}
    </div>
  );
}

export function ChessBoard3D(props: ChessBoard3DProps) {
  const [canUseWebGl] = useState(() => isWebGlAvailable());
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [lowPower3D] = useState(() => prefersLowPower3D());
  const fallback = <ChessBoardFallback2D {...props} />;

  if (props.force2D || !canUseWebGl || canvasFailed) {
    return fallback;
  }

  return (
    <BoardErrorBoundary fallback={fallback}>
      <div className="grok-3d-board" aria-label="3D chess board">
        <Canvas
          dpr={lowPower3D ? [1, 1.15] : [1, 1.4]}
          camera={{ position: [0, 7.3, 8.3], fov: 42, near: 0.1, far: 80 }}
          gl={{ antialias: !lowPower3D, alpha: true, powerPreference: 'default' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event: Event) => {
              event.preventDefault();
              setCanvasFailed(true);
            }, { once: true });
          }}
        >
          <color attach="background" args={['#020206']} />
          <fog attach="fog" args={['#020206', 12, 28]} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[2.5, 8, 4]} intensity={lowPower3D ? 1.55 : 1.9} />
          <pointLight position={[-4, 3, 5]} intensity={lowPower3D ? 8 : 13} color="#00e5ff" distance={11} />
          <pointLight position={[5, 3, -3]} intensity={lowPower3D ? 5 : 8} color="#ff4dd8" distance={10} />
          <BoardScene key={props.boardKey} {...props} />
        </Canvas>
      </div>
    </BoardErrorBoundary>
  );
}
