import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Film } from 'lucide-react';
import { useAuth } from './auth';
import type { SeatMap } from './types';

/** Poster with a title-card fallback so a broken image never hides a movie. */
export function Poster({ src, title, className }: { src: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed) return <div className={`poster-fallback ${className ?? ''}`} role="img" aria-label={`${title} poster`}><Film size={20} /><span>{title}</span></div>;
  return <img className={className} src={src} alt={`${title} poster`} loading="lazy" onError={() => setFailed(true)} />;
}

export const Loading = ({ text = 'Loading…' }: { text?: string }) => <div className="empty-state"><p>{text}</p></div>;

/** Counts down to a timestamp (ms). Calls onExpire once when it reaches zero. */
export function useCountdown(expiresAt: number | null, onExpire?: () => void) {
  const [now, setNow] = useState(Date.now());
  const cb = useRef(onExpire); cb.current = onExpire;
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [expiresAt]);
  const left = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  useEffect(() => { if (expiresAt && left === 0) cb.current?.(); }, [left, expiresAt]);
  return left;
}

/** Route guard. The backend ALSO rejects these API calls without a valid token / admin role. */
export function RequireAuth({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { user, loading, openAuth } = useAuth();
  useEffect(() => { if (!loading && !user) openAuth('signin', 'Please sign in to continue.'); }, [loading, user, openAuth]);
  if (loading) return <main className="flow-page"><Loading /></main>;
  if (!user) return (
    <main className="flow-page"><div className="empty-state">
      <h3>Sign in required</h3><p>Please sign in to see this page.</p>
      <button className="primary-btn" onClick={() => openAuth('signin')}>Sign in →</button>
    </div></main>
  );
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

const LEGEND = [
  ['legend-free', 'Available'], ['legend-chosen', 'Selected'], ['legend-held', 'Held by someone else'], ['legend-taken', 'Booked'],
] as const;

/** 8 x 10 seat map. Pass onToggle for the customer view; omit it for a read-only admin view. */
export function SeatGrid({ map, selected, onToggle }: { map: SeatMap; selected: string[]; onToggle?: (label: string) => void }) {
  const byLabel = new Map(map.seats.map((s) => [s.label, s]));
  return (
    <>
      <div className="screen"><div className="screen-glow" /><span>SCREEN THIS WAY</span></div>
      <div className="seat-map">
        {map.rows.map((row) => (
          <div className="seat-row" key={row}>
            <span className="row-label">{row}</span>
            {Array.from({ length: map.columns }, (_, i) => {
              const label = `${row}${i + 1}`;
              const s = byLabel.get(label)!;
              const chosen = selected.includes(label);
              // My own (still valid) hold counts as selectable; someone else's hold or a booking does not.
              const blocked = s.status === 'booked' || (s.status === 'held' && !s.mine);
              const cls = s.status === 'booked' ? 'unavailable' : blocked ? 'held' : chosen ? 'chosen' : '';
              const text = s.status === 'booked' ? 'Booked' : blocked ? 'Held by someone else' : chosen ? 'Selected' : 'Available';
              return (
                <button key={label} aria-label={`Seat ${label}, ${text}`} title={`${label} · ${text}`}
                  disabled={blocked} className={`seat ${cls} ${i === 4 ? 'aisle' : ''} ${onToggle ? '' : 'readonly'}`}
                  onClick={() => onToggle?.(label)}>
                  {s.status === 'booked' ? '×' : i + 1}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="seat-legend">{LEGEND.map(([c, t]) => <span key={c}><i className={c} /> {t}</span>)}</div>
    </>
  );
}
