import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../services/api';

export function useSocket(projectId?: string, taskId?: string) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = api.getAccessToken();
    if (!token) return;

    const socket = io('/', {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (projectId) socket.emit('join:project', projectId);
      if (taskId) socket.emit('join:task', taskId);
    });

    return () => {
      if (projectId) socket.emit('leave:project', projectId);
      if (taskId) socket.emit('leave:task', taskId);
      socket.disconnect();
    };
  }, [projectId, taskId]);

  return socketRef;
}

export function useSocketEvent(
  projectId: string | undefined,
  event: string,
  handler: (data: unknown) => void
) {
  const socketRef = useSocket(projectId);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
  }, [socketRef, event, handler]);
}
