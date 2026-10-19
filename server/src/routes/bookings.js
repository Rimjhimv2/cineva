import { Router } from 'express';
import { HttpError, wrap, withTx, parseId, CANCEL_CUTOFF_HOURS } from '../lib.js';

// Every query below filters on b.user_id = the logged-in user, so another user's booking
// simply does not exist as far as the caller is concerned (404, not 403).
const BOOKING_SQL = `
  SELECT b.id, b.status, b.total_amount::float8 AS "totalAmount", b.created_at AS "createdAt",
         s.id AS "showId", s.starts_at AS "startsAt", m.title, m.poster, m.language, m.certificate,
         ARRAY(SELECT seat_label FROM booking_seats bs WHERE bs.booking_id = b.id
               ORDER BY LEFT(seat_label, 1), LENGTH(seat_label), seat_label) AS seats,
         (b.status = 'CONFIRMED' AND s.starts_at - NOW() >= make_interval(hours => ${CANCEL_CUTOFF_HOURS})) AS "canCancel"
  FROM bookings b
  JOIN shows s ON s.id = b.show_id
  JOIN movies m ON m.id = s.movie_id`;

export default function bookingRoutes(pool, authenticate) {
  const r = Router();
  r.use(authenticate);

  // Upcoming shows first (soonest first), then past shows (most recent first).
  r.get('/me', wrap(async (req, res) => {
    const q = await pool.query(
      `${BOOKING_SQL} WHERE b.user_id = $1
       ORDER BY (s.starts_at < NOW()), CASE WHEN s.starts_at >= NOW() THEN s.starts_at END ASC, s.starts_at DESC`,
      [req.user.id]);
    res.json(q.rows);
  }));

  r.get('/:id', wrap(async (req, res) => {
    const q = await pool.query(`${BOOKING_SQL} WHERE b.id = $1 AND b.user_id = $2`, [parseId(req.params.id), req.user.id]);
    if (!q.rowCount) throw new HttpError(404, 'Booking not found.');
    res.json(q.rows[0]);
  }));

  // Bonus flow 8: cancel up to 2 hours before the show.
  r.post('/:id/cancel', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    await withTx(pool, async (db) => {
      const q = await db.query(
        `SELECT b.status, s.starts_at, (s.starts_at <= NOW()) AS started,
                (s.starts_at - NOW() < make_interval(hours => ${CANCEL_CUTOFF_HOURS})) AS too_late
         FROM bookings b JOIN shows s ON s.id = b.show_id
         WHERE b.id = $1 AND b.user_id = $2 FOR UPDATE OF b`, [id, req.user.id]);
      if (!q.rowCount) throw new HttpError(404, 'Booking not found.');
      const b = q.rows[0];
      if (b.status === 'CANCELLED') throw new HttpError(400, 'This booking is already cancelled.');
      if (b.started) throw new HttpError(400, 'Bookings for past shows cannot be cancelled.');
      if (b.too_late) throw new HttpError(400, `Bookings can only be cancelled up to ${CANCEL_CUTOFF_HOURS} hours before the show starts.`);
      await db.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, [id]);
      await db.query('DELETE FROM show_seats WHERE booking_id = $1', [id]); // seats are free again immediately
    });
    const out = await pool.query(`${BOOKING_SQL} WHERE b.id = $1 AND b.user_id = $2`, [id, req.user.id]);
    res.json(out.rows[0]);
  }));

  return r;
}
