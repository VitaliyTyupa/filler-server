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

const hasContact = (state: GameState): boolean => {
  const { cols, rows, owner } = state;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const idx = indexFromCoord({ x, y }, cols);
      if (owner[idx] === 0) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds({ x: nx, y: ny }, { cols, rows, paletteSize: state.paletteSize })) continue;
        const nIdx = indexFromCoord({ x: nx, y: ny }, cols);
        if (owner[idx] === 1 && owner[nIdx] === 2) return true;
        if (owner[idx] === 2 && owner[nIdx] === 1) return true;
      }
    }
  }
  return false;
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

export function getValidMoves(state: GameState, playerId: PlayerId): boolean[] {
  const valid: boolean[] = Array.from({ length: state.paletteSize }, () => true);
  const opponent: PlayerId = playerId === 1 ? 2 : 1;

  if (state.playerColor[playerId] < valid.length) {
    valid[state.playerColor[playerId]] = false;
  }

  if (hasContact(state) && state.playerColor[opponent] < valid.length) {
    valid[state.playerColor[opponent]] = false;
  }

  return valid;
}

export function applyMove(state: GameState, playerId: PlayerId, colorIndex: number): GameState {
  if (playerId !== state.currentPlayer) {
    return state;
  }

  const validMoves = getValidMoves(state, playerId);
  if (!validMoves[colorIndex]) {
    return state;
  }

  const { cols, rows } = state;
  const totalCells = cols * rows;
  const owner = state.owner;
  const color = state.color;

  for (let i = 0; i < totalCells; i += 1) {
    if (owner[i] === playerId) {
      color[i] = colorIndex;
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    if (owner[i] === playerId) {
      queue.push(i);
    }
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % cols;
    const y = Math.floor(idx / cols);

    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds({ x: nx, y: ny }, { cols, rows, paletteSize: state.paletteSize })) continue;
      const nIdx = indexFromCoord({ x: nx, y: ny }, cols);

      if (owner[nIdx] === playerId) {
        continue;
      }

      if (color[nIdx] === colorIndex) {
        owner[nIdx] = playerId;
        queue.push(nIdx);
      }
    }
  }

  state.playerColor[playerId] = colorIndex;
  state.score[1] = 0;
  state.score[2] = 0;

  for (let i = 0; i < totalCells; i += 1) {
    const ownerId = owner[i];
    if (ownerId === 1 || ownerId === 2) {
      state.score[ownerId] += 1;
    }
  }

  state.currentPlayer = playerId === 1 ? 2 : 1;

  return state;
}
