export type AppPermissionId = 'notifications' | 'storage' | 'clipboard';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'checking';

export interface AppPermissionStatus {
  id: AppPermissionId;
  label: string;
  description: string;
  state: PermissionState;
}

const STORAGE_TEST_KEY = '__pramukh_alpha_perm_test__';

export const REQUIRED_PERMISSIONS: Omit<AppPermissionStatus, 'state'>[] = [
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Due date reminders, overdue alerts, mentions, and status updates',
  },
  {
    id: 'storage',
    label: 'Local storage',
    description: 'Keep you signed in and save your session securely',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    description: 'Copy task links, IDs, and report data',
  },
];

function checkLocalStorage(): PermissionState {
  try {
    localStorage.setItem(STORAGE_TEST_KEY, '1');
    localStorage.removeItem(STORAGE_TEST_KEY);
    return 'granted';
  } catch {
    return 'denied';
  }
}

async function checkNotificationPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported';
  const perm = Notification.permission;
  if (perm === 'granted') return 'granted';
  if (perm === 'denied') return 'denied';
  return 'prompt';
}

async function requestNotificationPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : 'denied';
}

async function checkClipboardPermission(): Promise<PermissionState> {
  if (!navigator.clipboard?.writeText) return 'unsupported';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

async function requestClipboardPermission(): Promise<PermissionState> {
  if (!navigator.clipboard?.writeText) return 'unsupported';
  try {
    await navigator.clipboard.writeText('');
    return 'granted';
  } catch {
    return 'denied';
  }
}

async function checkPermission(id: AppPermissionId): Promise<PermissionState> {
  switch (id) {
    case 'notifications':
      return checkNotificationPermission();
    case 'storage':
      return checkLocalStorage();
    case 'clipboard':
      return checkClipboardPermission();
    default:
      return 'denied';
  }
}

async function requestPermission(id: AppPermissionId): Promise<PermissionState> {
  switch (id) {
    case 'notifications':
      return requestNotificationPermission();
    case 'storage':
      return checkLocalStorage();
    case 'clipboard':
      return requestClipboardPermission();
    default:
      return 'denied';
  }
}

export async function getAllPermissionStatuses(): Promise<AppPermissionStatus[]> {
  const results = await Promise.all(
    REQUIRED_PERMISSIONS.map(async (perm) => ({
      ...perm,
      state: await checkPermission(perm.id),
    }))
  );
  return results;
}

export async function requestAllPermissions(): Promise<AppPermissionStatus[]> {
  const statuses: AppPermissionStatus[] = [];

  for (const perm of REQUIRED_PERMISSIONS) {
    let state = await checkPermission(perm.id);
    if (state === 'prompt') {
      state = await requestPermission(perm.id);
    }
    statuses.push({ ...perm, state });
    if (state !== 'granted') break;
  }

  if (statuses.length < REQUIRED_PERMISSIONS.length) {
    const checked = new Set(statuses.map((s) => s.id));
    for (const perm of REQUIRED_PERMISSIONS) {
      if (!checked.has(perm.id)) {
        statuses.push({ ...perm, state: await checkPermission(perm.id) });
      }
    }
  }

  return statuses;
}

export function allPermissionsGranted(statuses: AppPermissionStatus[]): boolean {
  return statuses.every((s) => s.state === 'granted');
}

export function hasDeniedPermissions(statuses: AppPermissionStatus[]): boolean {
  return statuses.some((s) => s.state === 'denied' || s.state === 'unsupported');
}
