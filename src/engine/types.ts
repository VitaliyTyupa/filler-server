export type PlayerId = 1 | 2;

export interface GameState {
  cols: number;
  rows: number;
  paletteSize: number;

  owner: Uint8Array; // 0/1/2
  color: Uint8Array; // color indices
  playerColor: Uint8Array; // size 3
  currentPlayer: PlayerId;
  score: Uint16Array; // size 3
}

export interface GameResult {
  winner: 0 | PlayerId;
  score1: number;
  score2: number;
}
