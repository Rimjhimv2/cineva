import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Ticket, X } from 'lucide-react';
import { api } from '../api';
import type { Booking } from '../types';
import { CINEMA, bookingRef, dateLabel, money, timeLabel } from '../format';
import { Loading, Poster } from '../ui';

export default function BookingsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<Booking[] | null>(null);
  const [notice, setNotice] = useState('');
  const load = () => api<Booking[]>('/bookings/me').then(setList).catch((e) => setNotice(e.message));
  useEffect(() => { load(); }, []);

  const cancel = async (b: Booking) => {
    if (!window.confirm(`Cancel booking ${bookingRef(b.id)} for ${b.title}?`)) return;
    setNotice('');
    try { await api(`/bookings/${b.id}/cancel`, { method: 'POST' }); await load(); }
    catch (e) { setNotice((e as Error).message); await load(); }
  };

  const now = Date.now();
  const upcoming = (list ?? []).filter((b) => new Date(b.startsAt).getTime() >= now);
  const past = (list ?? []).filter((b) => new Date(b.startsAt).getTime() < now);

  const card = (b: Booking, isPast: boolean) => (
    <article className={`booking-item ${b.status === 'CANCELLED' ? 'cancelled' : ''}`} key={b.id}>
      <Poster src={b.poster} title={b.title} />
      <div className="booking-info">
        <span className={`booking-status ${b.status === 'CANCELLED' ? 'status-cancelled' : ''}`}>
          {b.status === 'CANCELLED' ? <X size={12} /> : <Check size={12} />} {b.status}
        </span>
        <h3>{b.title}</h3>
        <p>{CINEMA}</p>
        <p>{dateLabel(b.startsAt)} · {timeLabel(b.startsAt)} · Seats {b.seats.join(', ')}</p>
        <small>Booking ID: {bookingRef(b.id)}</small>
        {b.status === 'CONFIRMED' && !isPast && (b.canCancel
          ? <div><button className="outline-btn cancel-btn" onClick={() => cancel(b)}>Cancel booking</button></div>
          : <div><small className="cancel-note">Cancellation closed (less than 2 hours to showtime)</small></div>)}
      </div>
      <strong>{money(b.totalAmount)}</strong>
    </article>
  );

  return (
    <main className="flow-page">
      <button className="back-link" onClick={() => nav('/')}><ArrowLeft size={16} /> Back</button>
      <div className="flow-title">
        <div className="eyebrow muted">YOUR CINEMA PLANS</div>
        <h1>My <em>bookings.</em></h1>
        <p>All your tickets, in one place.</p>
      </div>
      {notice && <div className="form-notice" role="alert">{notice}</div>}
      {!list && !notice && <Loading />}
      {list && !list.length && (
        <div className="empty-state"><Ticket size={34} /><h3>No bookings yet</h3><p>Your next cinema night starts here.</p>
          <button className="primary-btn" onClick={() => nav('/')}>Explore movies →</button></div>
      )}
      {upcoming.length > 0 && <><h3 className="subhead">Upcoming <span>{upcoming.length}</span></h3><div className="booking-list">{upcoming.map((b) => card(b, false))}</div></>}
      {past.length > 0 && <><h3 className="subhead">Past <span>{past.length}</span></h3><div className="booking-list">{past.map((b) => card(b, true))}</div></>}
    </main>
  );
}
