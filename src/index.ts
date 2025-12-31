import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { generateInitialState, serializeState } from './engine/engine.js';
import { PlayerInfo, Room, RoomSettings } from './types.js';

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

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
