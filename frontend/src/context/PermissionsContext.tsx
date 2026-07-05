import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type CanFn = (resource: string, action: string, scope?: string) => boolean;

interface PermissionsContextType {
  permissions: string[];
  can: CanFn;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, permissions } = useAuth();

  const value = useMemo<PermissionsContextType>(() => ({
    permissions,
    can: (resource, action, scope = 'project') => {
      if (user?.systemRole === 'ADMIN') return true;
      return permissions.includes(`${resource}:${action}:${scope}`);
    },
  }), [user?.systemRole, permissions]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function useCan() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('useCan must be used within PermissionsProvider');
  return ctx;
}
