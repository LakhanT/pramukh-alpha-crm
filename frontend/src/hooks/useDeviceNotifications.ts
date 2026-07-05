import { useEffect, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { notificationTitle, showDeviceNotification } from '../utils/deviceNotifications';

interface NotificationPayload {
  type?: string;
  message: string;
  relatedTaskId?: string | null;
}

interface PushPayload {
  title: string;
  body: string;
  relatedTaskId?: string | null;
}

export function useDeviceNotifications(socketRef: MutableRefObject<Socket | null>) {
  const navigate = useNavigate();

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || Notification.permission !== 'granted') return;

    const recent = new Set<string>();

    const openTarget = (relatedTaskId?: string | null) => {
      if (relatedTaskId) navigate(`/tasks/${relatedTaskId}`);
      else navigate('/notifications');
    };

    const showPopup = (title: string, body: string, relatedTaskId?: string | null) => {
      const key = `${title}::${body}`;
      if (recent.has(key)) return;
      recent.add(key);
      setTimeout(() => recent.delete(key), 3000);

      showDeviceNotification({
        title,
        body,
        tag: relatedTaskId || key,
        onClick: () => openTarget(relatedTaskId),
      });
    };

    const onCreated = (notification: NotificationPayload) => {
      showPopup(
        notificationTitle(notification.type || 'GENERAL'),
        notification.message,
        notification.relatedTaskId
      );
    };

    const onPush = (payload: PushPayload) => {
      showPopup(payload.title, payload.body, payload.relatedTaskId);
    };

    const attach = () => {
      socket.on('notification:created', onCreated);
      socket.on('notification:push', onPush);
    };

    const detach = () => {
      socket.off('notification:created', onCreated);
      socket.off('notification:push', onPush);
    };

    if (socket.connected) attach();
    socket.on('connect', attach);

    return () => {
      socket.off('connect', attach);
      detach();
    };
  }, [socketRef, navigate]);
}
