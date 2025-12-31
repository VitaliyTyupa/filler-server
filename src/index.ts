import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
      hostPlayerId: 1
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('room:created', {
      roomId,
      assignedPlayerId: 1 as const,
      players: room.players
    });
  });

  socket.on('room:join', ({ roomId, name }: { roomId: string; name: string }) => {
    const room = rooms.get(roomId);

    if (!room || room.status !== 'lobby' || room.players[2]) {
      return;
    }

    const guest: PlayerInfo = { name, socketId: socket.id };
    room.players[2] = guest;
    socket.join(roomId);

    socket.emit('room:joined', {
      roomId,
      assignedPlayerId: 2 as const,
      players: room.players
    });

    io.to(roomId).emit('room:update', {
      roomId,
      status: room.status,
      players: room.players
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
