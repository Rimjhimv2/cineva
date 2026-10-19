import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Ticket, Timer, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { SeatMap, ShowDetail } from '../types';
import { CINEMA, dateLabel, mmss, money, timeLabel } from '../format';
import { Loading, Poster, useCountdown } from '../ui';

type PayState = 'closed' | 'choose' | 'failed';

export default function CheckoutPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [show, setShow] = useState<ShowDetail | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'active' | 'expired'>('loading');
  const [pay, setPay] = useState<PayState>('closed');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const startTimer = (secondsLeft: number) => setExpiresAt(Date.now() + secondsLeft * 1000);

  useEffect(() => {
    (async () => {
      try {
        const [s, m] = await Promise.all([api<ShowDetail>(`/shows/${id}`), api<SeatMap>(`/shows/${id}/seats`)]);
        setShow(s);
        if (m.myHold) { setSeats(m.myHold.seats); startTimer(m.myHold.secondsLeft); setState('active'); }
        else setState('expired');
      } catch (e) { setMessage((e as Error).message); setState('expired'); }
    })();
  }, [id]);

  const onExpire = useCallback(() => { setState('expired'); setPay('closed'); setMessage('Your 5-minute hold has expired and the seats were released.'); }, []);
  const left = useCountdown(state === 'active' ? expiresAt : null, onExpire);

  const total = (show?.price ?? 0) * seats.length;

  const changeSeats = async () => {
    await api(`/shows/${id}/hold`, { method: 'DELETE' }).catch(() => {});
    nav(`/shows/${id}/seats`);
  };

  const submitPayment = async (result: 'success' | 'failure') => {
    setBusy(true); setMessage('');
    try {
      const r = await api<{ bookingId: number }>(`/shows/${id}/pay`, { method: 'POST', body: { result, seats } });
      nav(`/bookings/${r.bookingId}/confirmed`, { replace: true });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 402) {                       // simulated payment failure: hold is kept
        setMessage(err.message);
        if (typeof err.data.secondsLeft === 'number') startTimer(err.data.secondsLeft);
        setPay('failed');
      } else if (err.status === 410) {                // hold expired
        setState('expired'); setPay('closed'); setMessage(err.message);
      } else { setPay('closed'); setMessage(err.message); }
    } finally { setBusy(false); }
  };

  if (state === 'loading' || !show) return <main className="flow-page"><Loading /></main>;

  if (state === 'expired') return (
    <main className="flow-page">
      <div className="empty-state" style={{ marginTop: 50 }}>
        <Timer size={34} /><h3>{message ? 'Hold ended' : 'No seats on hold'}</h3>
        <p>{message || 'You do not have any seats on hold for this show.'}</p>
        <button className="primary-btn" onClick={() => nav(`/shows/${id}/seats`)}>Choose seats again →</button>
      </div>
    </main>
  );

  return (
    <main className="flow-page">
      <button className="back-link" onClick={changeSeats}><ArrowLeft size={16} /> Change seats</button>
      <div className="flow-title">
        <div className="eyebrow muted">STEP 02 / 02 · REVIEW & PAY</div>
        <h1>One last <em>look.</em></h1>
        <p>Your seats are held for you. Pay before the timer runs out.</p>
      </div>
      <div className={`hold-timer ${left <= 60 ? 'urgent' : ''}`} role="timer"><Timer size={16} /> Seats held for <strong>{mmss(left)}</strong></div>

      <div className="checkout-grid">
        <section className="checkout-card">
          <h2>Booking summary</h2>
          <div className="checkout-movie">
            <Poster src={show.poster} title={show.title} />
            <div><h3>{show.title}</h3><p>{show.genre}</p><span>{show.certificate} · {show.duration} min</span></div>
          </div>
          <div className="summary-line"><span><MapPin size={15} /> {CINEMA}</span></div>
          <div className="summary-line"><span><CalendarDays size={15} /> {dateLabel(show.startsAt)} · {timeLabel(show.startsAt)}</span></div>
          <div className="summary-line"><span><Ticket size={15} /> Seats: {seats.join(', ')}</span></div>
          <div className="price-breakdown">
            <div><span>Tickets ({seats.length} × {money(show.price)})</span><span>{money(total)}</span></div>
            <div className="total-line"><strong>Total payable</strong><strong>{money(total)}</strong></div>
          </div>
          <div className="demo-notice"><Ticket size={16} /> Demo payment: no real money is collected.</div>
          {message && pay === 'closed' && <div className="form-notice" role="alert">{message}</div>}
          <button className="primary-btn full-btn" onClick={() => { setMessage(''); setPay('choose'); }}>Pay {money(total)} <span>→</span></button>
        </section>
        <aside className="secure-card">
          <div className="secure-icon"><Timer size={24} /></div>
          <h3>Almost at the movies.</h3>
          <p>No one else can book these seats while your hold is active. If the timer ends, they are released.</p>
          <div className="secure-rule" />
          <span>YOUR SEATS</span><strong>{seats.join(', ')}</strong>
          <span>DATE & TIME</span><strong>{dateLabel(show.startsAt)} at {timeLabel(show.startsAt)}</strong>
        </aside>
      </div>

      {pay !== 'closed' && (
        <div className="modal-backdrop" onClick={() => !busy && setPay('closed')}>
          <section className="auth-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Payment">
            <button className="modal-close" onClick={() => setPay('closed')} aria-label="Close"><X /></button>
            {pay === 'choose' && <>
              <h2>Complete payment</h2>
              <p>This is a fake payment step so both outcomes can be tested. Amount: <strong>{money(total)}</strong> · Time left <strong>{mmss(left)}</strong></p>
              <div className="pay-buttons">
                <button className="primary-btn full-btn" disabled={busy} onClick={() => submitPayment('success')}>Payment success</button>
                <button className="outline-btn pay-fail" disabled={busy} onClick={() => submitPayment('failure')}>Payment failure</button>
              </div>
            </>}
            {pay === 'failed' && <>
              <h2>Payment failed</h2>
              <div className="form-notice" role="alert">{message}</div>
              <p>Time left to try again: <strong>{mmss(left)}</strong></p>
              <button className="primary-btn full-btn" onClick={() => { setMessage(''); setPay('choose'); }}>Try again</button>
            </>}
          </section>
        </div>
      )}
    </main>
  );
}
