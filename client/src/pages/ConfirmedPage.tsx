import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../api';
import type { Booking } from '../types';
import { CINEMA, bookingRef, dateLabel, money, timeLabel } from '../format';
import { Loading, Poster } from '../ui';

export default function ConfirmedPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Booking>(`/bookings/${id}`).then(setB).catch((e) => setError(e.message)); }, [id]);

  if (error) return <main className="flow-page"><div className="empty-state"><h3>{error}</h3></div></main>;
  if (!b) return <main className="flow-page"><Loading /></main>;
  return (
    <main className="flow-page">
      <div className="success-page">
        <div className="success-icon"><Check size={35} /></div>
        <div className="eyebrow muted" style={{ justifyContent: 'center' }}>IT'S OFFICIALLY A PLAN</div>
        <h1>You're going to<br /><em>the movies.</em></h1>
        <p>Your booking is confirmed. Grab your popcorn.</p>
        <div className="ticket-receipt">
          <div className="receipt-top"><span>CINEVA <i>✳</i></span><span>BOOKING CONFIRMED</span></div>
          <div className="receipt-movie">
            <Poster src={b.poster} title={b.title} />
            <div><h2>{b.title}</h2><p>{CINEMA}</p><p>{dateLabel(b.startsAt)} · {timeLabel(b.startsAt)}</p></div>
          </div>
          <div className="receipt-details">
            <div><span>BOOKING ID</span><strong>{bookingRef(b.id)}</strong></div>
            <div><span>SEATS</span><strong>{b.seats.join(', ')}</strong></div>
            <div><span>AMOUNT PAID*</span><strong>{money(b.totalAmount)}</strong></div>
          </div>
          <div className="barcode">|||| ||| |||| || ||||| ||| ||||</div>
          <small>*Demo only: no real payment was processed.</small>
        </div>
        <div className="success-actions">
          <button className="primary-btn" onClick={() => nav('/bookings')}>View my bookings →</button>
          <button className="outline-btn" onClick={() => nav('/')}>Explore more films</button>
        </div>
      </div>
    </main>
  );
}
