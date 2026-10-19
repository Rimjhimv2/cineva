import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../api';
import type { SeatMap, ShowDetail } from '../types';
import { CINEMA, dateLabel, money, timeLabel } from '../format';
import { Loading, SeatGrid } from '../ui';

const MAX_SEATS = 6;
const POLL_MS = 3000; // live updates: the map is re-read every 3 seconds (see README for why polling)

export default function SeatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [show, setShow] = useState<ShowDetail | null>(null);
  const [map, setMap] = useState<SeatMap | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstLoad = useRef(true);

  const loadMap = useCallback(async () => {
    try {
      const m = await api<SeatMap>(`/shows/${id}/seats`);
      setMap(m);
      const free = new Set(m.seats.filter((s) => s.status === 'available' || (s.status === 'held' && s.mine)).map((s) => s.label));
      setSelected((old) => {
        // First load: if I already hold seats (e.g. after a refresh) start with them selected.
        if (firstLoad.current) { firstLoad.current = false; return m.myHold?.seats ?? []; }
        const kept = old.filter((l) => free.has(l));
        const lost = old.filter((l) => !free.has(l));
        if (lost.length) setNotice(`${lost.join(', ')} ${lost.length === 1 ? 'was' : 'were'} just taken by someone else. The map has been updated.`);
        return kept;
      });
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => {
    firstLoad.current = true;
    api<ShowDetail>(`/shows/${id}`).then(setShow).catch((e) => setError(e.message));
    loadMap();
    const t = setInterval(() => { if (!document.hidden) loadMap(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) loadMap(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [id, loadMap]);

  const toggle = (label: string) => {
    setNotice('');
    setSelected((old) => {
      if (old.includes(label)) return old.filter((s) => s !== label);
      if (old.length >= MAX_SEATS) { setNotice(`You can select up to ${MAX_SEATS} seats per booking.`); return old; }
      return [...old, label];
    });
  };

  const sorted = [...selected].sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
  const total = (show?.price ?? 0) * sorted.length;

  const cont = async () => {
    setBusy(true); setNotice('');
    try {
      await api(`/shows/${id}/hold`, { method: 'POST', body: { seats: sorted } });
      nav(`/shows/${id}/checkout`);
    } catch (e) {
      const err = e as ApiError;
      setNotice(err.message);          // tells the user which seat was taken
      await loadMap();                 // ...and the map refreshes
    } finally { setBusy(false); }
  };

  if (error && !show) return <main className="flow-page"><div className="empty-state"><h3>{error}</h3></div></main>;
  if (!show || !map) return <main className="flow-page"><Loading /></main>;

  return (
    <main className="flow-page">
      <button className="back-link" onClick={() => nav(`/movies/${show.movieId}`)}><ArrowLeft size={16} /> Back to shows</button>
      <div className="flow-title">
        <div className="eyebrow muted">STEP 01 / 02 · PICK YOUR SEATS</div>
        <h1>Your spot in the <em>story.</em></h1>
        <p>{show.title} · {CINEMA} · {dateLabel(show.startsAt)}, {timeLabel(show.startsAt)}</p>
      </div>

      <div className="seat-layout">
        <SeatGrid map={map} selected={selected} onToggle={show.started ? undefined : toggle} />
        <div className="live-note"><i /> {map.available} of 80 seats available · updates live</div>
        {show.started && <div className="form-notice">This show has already started.</div>}
        {notice && <div className="form-notice" role="alert">{notice}</div>}
        <div className="seat-summary">
          <div><span>SELECTED SEATS</span><strong>{sorted.length ? sorted.join(', ') : `Choose 1 to ${MAX_SEATS} seats`}</strong></div>
          <div><span>TOTAL</span><strong>{money(total)} <small>{sorted.length} × {money(show.price)}</small></strong></div>
          <button className="primary-btn" disabled={!sorted.length || busy || show.started} onClick={cont}>
            {busy ? 'Holding seats…' : <>Continue · {money(total)} <span>→</span></>}
          </button>
        </div>
      </div>
    </main>
  );
}
