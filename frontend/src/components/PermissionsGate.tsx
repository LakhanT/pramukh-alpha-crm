import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bell, Clipboard, HardDrive, ShieldAlert } from 'lucide-react';
import {
  allPermissionsGranted,
  getAllPermissionStatuses,
  hasDeniedPermissions,
  requestAllPermissions,
  type AppPermissionStatus,
  type PermissionState,
} from '../utils/appPermissions';
import { showDeviceNotification } from '../utils/deviceNotifications';

const ICONS: Record<string, typeof Bell> = {
  notifications: Bell,
  storage: HardDrive,
  clipboard: Clipboard,
};

function statusLabel(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'prompt':
      return 'Required';
    case 'unsupported':
      return 'Not supported';
    default:
      return 'Checking…';
  }
}

export default function PermissionsGate({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<AppPermissionStatus[]>([]);
  const [checking, setChecking] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [granted, setGranted] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    const next = await getAllPermissionStatuses();
    setStatuses(next);
    setGranted(allPermissionsGranted(next));
    setChecking(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => { refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const handleGrantAll = async () => {
    setRequesting(true);
    const next = await requestAllPermissions();
    setStatuses(next);
    const ok = allPermissionsGranted(next);
    setGranted(ok);
    setRequesting(false);
    if (ok) {
      showDeviceNotification({
        title: 'Pramukh Alpha',
        body: 'Notifications enabled. You will receive task alerts on this device.',
      });
    }
  };

  if (checking) {
    return (
      <div className="permissions-gate">
        <div className="permissions-gate-card card">
          <p className="loading-text">Checking required permissions…</p>
        </div>
      </div>
    );
  }

  if (granted) {
    return <>{children}</>;
  }

  const denied = hasDeniedPermissions(statuses);
  const pending = statuses.some((s) => s.state === 'prompt');

  return (
    <div className="permissions-gate">
      <div className="permissions-gate-card card">
        <div className="permissions-gate-icon">
          <ShieldAlert size={40} />
        </div>
        <h1>Permissions required</h1>
        <p className="permissions-gate-subtitle">
          Pramukh Alpha needs the following browser permissions before you can sign in or use the app.
          Access is blocked until every permission is granted.
        </p>

        <ul className="permissions-list">
          {statuses.map((perm) => {
            const Icon = ICONS[perm.id] || Bell;
            return (
              <li key={perm.id} className={`permissions-item permissions-item--${perm.state}`}>
                <div className="permissions-item-icon">
                  <Icon size={20} />
                </div>
                <div className="permissions-item-body">
                  <strong>{perm.label}</strong>
                  <span>{perm.description}</span>
                </div>
                <span className={`permissions-badge permissions-badge--${perm.state}`}>
                  {statusLabel(perm.state)}
                </span>
              </li>
            );
          })}
        </ul>

        {denied && (
          <div className="permissions-denied-box">
            One or more permissions were denied or are not supported in this browser.
            Open your browser site settings, allow notifications and clipboard for this site, then click
            &quot;Check again&quot;.
          </div>
        )}

        <div className="permissions-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleGrantAll}
            disabled={requesting}
          >
            {requesting ? 'Requesting…' : pending || denied ? 'Grant all permissions' : 'Check again'}
          </button>
          <button type="button" className="btn-secondary" onClick={refresh} disabled={requesting}>
            Refresh status
          </button>
        </div>
      </div>
    </div>
  );
}
