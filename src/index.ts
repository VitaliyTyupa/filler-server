import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  applyMove,
  generateInitialState,
  getValidMoves,
  isGameOver,
  getWinner,
  serializeState
} from './engine/engine.js';
import { PlayerId, PlayerInfo, Room, RoomSettings } from './types.js';

const app = express();

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const rooms = new Map<string, Room>();
const socketToSession = new Map<string, { roomId: string; playerId: PlayerId }>();

const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateRoomId = (): string => {
  let roomId = '';

  do {
    roomId = Array.from({ length: ROOM_ID_LENGTH }, () =>
      ROOM_ID_CHARS.charAt(Math.floor(Math.random() * ROOM_ID_CHARS.length))
    ).join('');
  } while (rooms.has(roomId));

  return roomId;
};

const sanitizePlayer = (player?: PlayerInfo) => {
  if (!player) return undefined;
  return { name: player.name };
};

const sanitizePlayers = (players: Room['players']) => ({
  1: sanitizePlayer(players[1]),
  2: sanitizePlayer(players[2])
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('room:create', ({ name, settings }: { name: string; settings: RoomSettings }) => {
    const host: PlayerInfo = { name, socketId: socket.id };
    const roomId = generateRoomId();

    const room: Room = {
      roomId,
      status: 'lobby',
      createdAt: Date.now(),
      settings,
      players: { 1: host },
      hostPlayerId: 1,
      lastActivityAt: Date.now()
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socketToSession.set(socket.id, { roomId, playerId: 1 });

    socket.emit('room:created', {
      roomId,
      assignedPlayerId: 1 as const,
      players: sanitizePlayers(room.players)
    });
  });

  socket.on('room:join', ({ roomId, name }: { roomId: string; name: string }) => {
    const room = rooms.get(roomId);

    if (!room || room.status !== 'lobby' || room.players[2]) {
      return;
    }

    const guest: PlayerInfo = { name, socketId: socket.id };
    room.players[2] = guest;
    room.lastActivityAt = Date.now();
    socket.join(roomId);
    socketToSession.set(socket.id, { roomId, playerId: 2 });

    socket.emit('room:joined', {
      roomId,
      assignedPlayerId: 2 as const,
      players: sanitizePlayers(room.players)
    });

    io.to(roomId).emit('room:update', {
      roomId,
      status: room.status,
      players: sanitizePlayers(room.players)
    });
  });

  socket.on('room:start', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    if (room.status !== 'lobby') {
      socket.emit('error', { code: 'ROOM_NOT_IN_LOBBY', message: 'Room is not in lobby' });
      return;
    }

    if (!room.players[1] || !room.players[2]) {
      socket.emit('error', { code: 'ROOM_NOT_READY', message: 'Room is missing players' });
      return;
    }

    if (room.players[1].socketId !== socket.id) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Only host can start the game' });
      return;
    }

    room.state = generateInitialState({
      cols: room.settings.cols,
      rows: room.settings.rows,
      paletteSize: room.settings.paletteSize
    });
    room.status = 'playing';
    room.lastActivityAt = Date.now();

    io.to(roomId).emit('room:update', {
      roomId,
      status: room.status,
      players: sanitizePlayers(room.players)
    });

    io.to(roomId).emit('game:state', {
      roomId,
      state: room.state ? serializeState(room.state) : null
    });
  });

  socket.on('move:pickColor', ({ roomId, colorIndex }: { roomId: string; colorIndex: number }) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    if (room.status !== 'playing') {
      socket.emit('error', { code: 'ROOM_NOT_PLAYING', message: 'Room is not playing' });
      return;
    }

    if (!room.state) {
      socket.emit('error', { code: 'ROOM_NOT_PLAYING', message: 'Room is not playing' });
      return;
    }

    const session = socketToSession.get(socket.id);
    if (!session || session.roomId !== roomId) {
      socket.emit('error', { code: 'NOT_IN_ROOM', message: 'Not part of the room' });
      return;
    }

    const playerId = session.playerId;

    if (playerId !== room.state.currentPlayer) {
      socket.emit('error', { code: 'NOT_YOUR_TURN', message: 'Not your turn' });
      return;
    }

    const validMoves = getValidMoves(room.state, playerId);
    if (!validMoves[colorIndex]) {
      socket.emit('error', { code: 'INVALID_MOVE', message: 'Invalid move' });
      return;
    }

    room.state = applyMove(room.state, playerId, colorIndex);
    room.lastActivityAt = Date.now();

    io.to(roomId).emit('game:state', {
      roomId,
      state: room.state ? serializeState(room.state) : null
    });

    if (room.state && isGameOver(room.state)) {
      room.status = 'finished';
      const result = getWinner(room.state);
      io.to(roomId).emit('game:over', { roomId, result });
      io.to(roomId).emit('room:update', {
        roomId,
        status: room.status,
        players: sanitizePlayers(room.players)
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    const session = socketToSession.get(socket.id);
    if (!session) return;

    const { roomId, playerId } = session;
    const room = rooms.get(roomId);

    socketToSession.delete(socket.id);

    if (!room) return;

    if (room.status === 'playing') {
      const otherPlayerId: PlayerId = playerId === 1 ? 2 : 1;
      if (room.state) {
        const result = {
          winner: otherPlayerId,
          score1: room.state.score[1],
          score2: room.state.score[2]
        };
        room.status = 'finished';
        room.lastActivityAt = Date.now();
        if (room.players[playerId]) {
          room.players[playerId] = { name: room.players[playerId]!.name, socketId: '' };
        }
        io.to(roomId).emit('game:over', { roomId, result });
        io.to(roomId).emit('room:update', {
          roomId,
          status: room.status,
          players: sanitizePlayers(room.players)
        });
      }
    } else if (room.status === 'lobby') {
      if (room.players[playerId]) {
        delete room.players[playerId];
      }
      room.lastActivityAt = Date.now();
      io.to(roomId).emit('room:update', {
        roomId,
        status: room.status,
        players: sanitizePlayers(room.players)
      });
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
