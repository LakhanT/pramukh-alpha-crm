import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.frontendUrl, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) return next(new Error('Authentication required'));
    try {
      const user = jwt.verify(token, config.jwt.accessSecret) as { id: string };
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    if (userId) socket.join(`user:${userId}`);

    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('join:task', (taskId: string) => {
      socket.join(`task:${taskId}`);
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('leave:task', (taskId: string) => {
      socket.leave(`task:${taskId}`);
    });
  });

  return io;
}
