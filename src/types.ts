export type PlayerId = 1 | 2;

export type GameMode = 'online';

export interface RoomSettings {
  cols: number;
  rows: number;
  paletteSize: 5 | 7 | 10;
}

export interface PlayerInfo {
  name: string;
  socketId: string;
}

export interface Room {
  roomId: string;
  status: 'lobby' | 'playing' | 'finished';
  createdAt: number;
  settings: RoomSettings;
  players: { 1?: PlayerInfo; 2?: PlayerInfo };
  hostPlayerId: PlayerId;
}
