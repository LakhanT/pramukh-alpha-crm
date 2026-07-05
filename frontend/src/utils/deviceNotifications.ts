const TYPE_LABELS: Record<string, string> = {
  DUE_DATE_APPROACHING: 'Due date reminder',
  OVERDUE: 'Overdue task',
  ESCALATION: 'Escalation alert',
  STATUS_CHANGE: 'Status changed',
  MENTION: 'You were mentioned',
  REASSIGNMENT: 'Task reassigned',
  GENERAL: 'Pramukh Alpha',
};

export function notificationTitle(type: string): string {
  return TYPE_LABELS[type] || 'Pramukh Alpha alert';
}

export function showDeviceNotification(options: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag || options.title,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    });

    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch {
    // Ignore if the browser blocks notifications in this context.
  }
}
