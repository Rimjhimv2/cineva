import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ticket, X } from 'lucide-react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

type Mode = 'signin' | 'signup';
type Ctx = {
  user: User | null; loading: boolean;
  openAuth: (mode?: Mode, notice?: string) => void;
  logout: () => void;
};
const AuthContext = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [modal, setModal] = useState<{ mode: Mode; notice: string } | null>(null);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { logout(); setModal({ mode: 'signin', notice: 'Your session expired. Please sign in again.' }); });
    if (!getToken()) return;
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [logout]);

  const value = useMemo<Ctx>(() => ({
    user, loading, logout,
    openAuth: (mode = 'signin', notice = '') => setModal({ mode, notice }),
  }), [user, loading, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modal && !user && <AuthModal initial={modal} onClose={() => setModal(null)} onDone={(u) => { setUser(u); setModal(null); }} />}
    </AuthContext.Provider>
  );
}

function AuthModal({ initial, onClose, onDone }: { initial: { mode: Mode; notice: string }; onClose: () => void; onDone: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [notice, setNotice] = useState(initial.notice);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    const signup = mode === 'signup';
    if (signup && f.name.trim().length < 2) return setNotice('Please enter your full name.');
    if (!f.email.includes('@')) return setNotice('Please enter a valid email address.');
    if (signup && f.password.length < 8) return setNotice('Password must be at least 8 characters.');
    if (!signup && !f.password) return setNotice('Please enter your password.');
    if (signup && f.password !== f.confirm) return setNotice('Passwords do not match.');
    setBusy(true);
    try {
      const r = await api<{ user: User; token: string }>(`/auth/${signup ? 'register' : 'login'}`, {
        method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), password: f.password },
      });
      setToken(r.token);
      onDone(r.user);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
        <div className="brand modal-brand"><span className="brand-icon"><Ticket size={20} /></span>cine<span>va</span><i>.</i></div>
        <h2>{mode === 'signup' ? 'Create your account.' : 'Welcome to the show.'}</h2>
        <p>{mode === 'signup' ? 'Join Cineva and keep your movie plans together.' : 'Sign in to book seats and see your bookings.'}</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {mode === 'signup' && <label>Full name<input value={f.name} onChange={set('name')} placeholder="Your full name" autoComplete="name" /></label>}
          <label>Email address<input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" value={f.password} onChange={set('password')} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
          {mode === 'signup' && <label>Confirm password<input type="password" value={f.confirm} onChange={set('confirm')} placeholder="Re-enter your password" autoComplete="new-password" /></label>}
          {notice && <div className="form-notice" role="alert">{notice}</div>}
          <button type="submit" className="primary-btn full-btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <div className="auth-switch">
          {mode === 'signup' ? 'Already have an account?' : 'New to Cineva?'}{' '}
          <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setNotice(''); }}>{mode === 'signup' ? 'Sign in' : 'Create account'}</button>
        </div>
        <small>Passwords are hashed on the server. Booking requires a signed-in account.</small>
      </section>
    </div>
  );
}
