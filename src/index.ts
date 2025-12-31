import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

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

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
