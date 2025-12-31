import { randomInt } from './rng.js';
import { GameResult, GameState, PlayerId } from './types.js';

type Bounds = { cols: number; rows: number; paletteSize: number };

type Coordinate = { x: number; y: number };

type Direction = [number, number];

const DIRECTIONS: Direction[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

const indexFromCoord = (coord: Coordinate, cols: number): number => coord.y * cols + coord.x;

const inBounds = ({ x, y }: Coordinate, { cols, rows }: Bounds): boolean =>
  x >= 0 && x < cols && y >= 0 && y < rows;

const floodFillOwner = (
  owner: Uint8Array,
  color: Uint8Array,
  start: Coordinate,
  player: PlayerId,
  bounds: Bounds
): number => {
  const queue: Coordinate[] = [start];
  const visited = new Set<number>();
  const startColor = color[indexFromCoord(start, bounds.cols)];
  let filled = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const idx = indexFromCoord(current, bounds.cols);
    if (visited.has(idx)) {
      continue;
    }
    visited.add(idx);

    if (color[idx] !== startColor || owner[idx] !== 0) {
      continue;
    }

    owner[idx] = player;
    filled += 1;

    for (const [dx, dy] of DIRECTIONS) {
      const next: Coordinate = { x: current.x + dx, y: current.y + dy };
      if (inBounds(next, bounds)) {
        queue.push(next);
      }
    }
  }

  return filled;
};

export function generateInitialState(bounds: Bounds): GameState {
  const { cols, rows, paletteSize } = bounds;
  const totalCells = cols * rows;
  const color = new Uint8Array(totalCells);
  const owner = new Uint8Array(totalCells);

  for (let i = 0; i < totalCells; i += 1) {
    color[i] = randomInt(paletteSize);
  }

  const topLeftIndex = 0;
  const bottomRightIndex = totalCells - 1;

  while (color[bottomRightIndex] === color[topLeftIndex]) {
    color[bottomRightIndex] = randomInt(paletteSize);
  }

  const playerColor = new Uint8Array(3);
  playerColor[1] = color[topLeftIndex];
  playerColor[2] = color[bottomRightIndex];

  const score = new Uint16Array(3);

  score[1] = floodFillOwner(owner, color, { x: 0, y: 0 }, 1, bounds);
  score[2] = floodFillOwner(
    owner,
    color,
    { x: cols - 1, y: rows - 1 },
    2,
    bounds
  );

  const state: GameState = {
    cols,
    rows,
    paletteSize,
    owner,
    color,
    playerColor,
    currentPlayer: 1,
    score
  };

  return state;
}

export function isGameOver(state: GameState): boolean {
  const filledCells = state.score[1] + state.score[2];
  return filledCells === state.cols * state.rows;
}

export function getWinner(state: GameState): GameResult {
  const score1 = state.score[1];
  const score2 = state.score[2];
  let winner: 0 | PlayerId = 0;

  if (score1 > score2) {
    winner = 1;
  } else if (score2 > score1) {
    winner = 2;
  }

  return {
    winner,
    score1,
    score2
  };
}

export function serializeState(state: GameState) {
  return {
    ...state,
    owner: Array.from(state.owner),
    color: Array.from(state.color),
    playerColor: Array.from(state.playerColor),
    score: Array.from(state.score)
  };
}
