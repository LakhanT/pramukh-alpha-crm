import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    const { user: me, permissions: perms } = await api.getMe();
    setUser(me);
    setPermissions(perms || []);
  };

  useEffect(() => {
    if (api.getAccessToken()) {
      loadSession()
        .catch(() => api.clearTokens())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { accessToken, refreshToken, user } = await api.login(email, password);
    api.setTokens(accessToken, refreshToken);
    setUser(user);
    try {
      await loadSession();
    } catch {
      /* login tokens are valid even if /me enrichment fails transiently */
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      api.clearTokens();
      setUser(null);
      setPermissions([]);
    }
  };

  const refreshUser = async () => {
    if (!api.getAccessToken()) return;
    await loadSession();
  };

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
