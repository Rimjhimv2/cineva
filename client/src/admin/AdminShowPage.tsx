import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import type { AdminBooking, AdminShow, SeatMap } from '../types';
import { bookingRef, dateLabel, dateTimeLabel, money, timeLabel } from '../format';
import { Loading, SeatGrid } from '../ui';

export default function AdminShowPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [show, setShow] = useState<AdminShow | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [map, setMap] = useState<SeatMap | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [all, b, m] = await Promise.all([
        api<AdminShow[]>('/admin/shows'), api<AdminBooking[]>(`/admin/shows/${id}/bookings`), api<SeatMap>(`/shows/${id}/seats`)]);
      setShow(all.find((s) => s.id === Number(id)) ?? null);
      setBookings(b); setMap(m);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  if (error) return <main className="flow-page"><div className="empty-state"><h3>{error}</h3></div></main>;
  if (!show || !bookings || !map) return <main className="flow-page"><Loading /></main>;

  return (
    <main className="flow-page admin-page">
      <button className="back-link" onClick={() => nav('/admin')}><ArrowLeft size={16} /> Admin panel</button>
      <div className="flow-title">
        <div className="eyebrow muted">SHOW DETAILS</div>
        <h1>{show.title}</h1>
        <p>{dateLabel(show.startsAt)}, {timeLabel(show.startsAt)} · {money(show.price)} per ticket</p>
      </div>
      <div className="stat-row">
        <div><span>SEATS BOOKED</span><strong>{show.booked} / {show.totalSeats}</strong></div>
        <div><span>FULL</span><strong>{show.percentFull}%</strong></div>
        <div><span>MONEY COLLECTED</span><strong>{money(show.revenue)}</strong></div>
      </div>

      <h3 className="subhead">Seat map <span>READ ONLY</span></h3>
      <div className="seat-layout"><SeatGrid map={map} selected={[]} /></div>

      <h3 className="subhead">Bookings <span>{bookings.length}</span></h3>
      {bookings.length ? (
        <div className="table-scroll"><table className="admin-table">
          <thead><tr><th>Booking ID</th><th>Customer</th><th>Seats</th><th>Booked at</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{bookings.map((b) => (
            <tr key={b.id}><td>{bookingRef(b.id)}</td><td>{b.customerName}<br /><small>{b.customerEmail}</small></td><td>{b.seats.join(', ')}</td>
              <td>{dateTimeLabel(b.bookedAt)}</td><td>{money(b.totalAmount)}</td><td>{b.status}</td></tr>))}
          </tbody>
        </table></div>
      ) : <div className="empty-state"><p>No bookings for this show yet.</p></div>}
    </main>
  );
}
