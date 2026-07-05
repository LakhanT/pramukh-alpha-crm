import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { normalizeCompanyEmail } from '../utils/email';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteMode, setInviteMode] = useState(!!inviteToken);

  useEffect(() => {
    if (inviteToken) setInviteMode(true);
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (inviteMode && inviteToken) {
        const { user } = await api.acceptInvite(inviteToken, password, name || undefined);
        await login(user.email, password);
      } else {
        await login(normalizeCompanyEmail(email), password);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1>Pramukh Alpha</h1>
        <p className="login-subtitle">
          {inviteMode ? 'Accept your invite and set your password' : 'Sign in to your task management workspace'}
        </p>
        <form onSubmit={handleSubmit}>
          {inviteMode && (
            <div className="form-group">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          {inviteMode && inviteToken ? null : (
          <div className="form-group">
            <label htmlFor="email">Company email</label>
            <input
              id="email"
              type="text"
              inputMode="email"
              placeholder="lakhan@pramukhalpha or lakhan@pramukhalpha.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={!inviteToken}
              autoComplete="username"
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Use your Pramukh Alpha company email. You can omit <code>.com</code> (e.g. lakhan@pramukhalpha).
            </p>
          </div>
          )}
          <div className="form-group">
            <label htmlFor="password">{inviteMode ? 'Choose a password' : 'Password'}</label>
            <input
              id="password"
              type="password"
              placeholder={inviteMode ? 'Create a strong password' : 'Enter your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={inviteMode ? 'new-password' : 'current-password'}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? (inviteMode ? 'Creating account…' : 'Signing in…') : (inviteMode ? 'Accept invite' : 'Sign in')}
          </button>
          {inviteMode && !inviteToken && (
            <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setInviteMode(false)}>
              Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
