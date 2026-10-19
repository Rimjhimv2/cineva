import { Router } from 'express';
import {
  HttpError, wrap, withTx, parseId, seatSort,
  ALL_SEATS, ROWS, COLS, MAX_SEATS, HOLD_SECONDS, TOTAL_SEATS,
} from '../lib.js';

const SEAT_RE = /^[A-H]([1-9]|10)$/;

function parseSeats(input) {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, 'Please select at least 1 seat.');
  const seats = [...new Set(input.map((s) => String(s).toUpperCase()))];
  if (seats.some((s) => !SEAT_RE.test(s))) throw new HttpError(400, 'Invalid seat selected.');
  if (seats.length > MAX_SEATS) throw new HttpError(400, `You can select at most ${MAX_SEATS} seats.`);
  return seats.sort(seatSort);
}

// Reads a show inside a transaction and refuses shows that do not exist or have started.
async function getBookableShow(client, showId) {
  const s = await client.query(
    'SELECT id, price::float8 AS price, (starts_at <= NOW()) AS started FROM shows WHERE id = $1', [showId]);
  if (!s.rowCount) throw new HttpError(404, 'Show not found.');
  if (s.rows[0].started) throw new HttpError(400, 'This show has already started.');
  return s.rows[0];
}

export default function seatRoutes(pool, authenticate) {
  const r = Router();

  // ---- Seat map: every seat is "available", "held" (by someone) or "booked". Expired holds count as available.
  r.get('/shows/:id/seats', authenticate, wrap(async (req, res) => {
    const showId = parseId(req.params.id);
    const exists = await pool.query('SELECT 1 FROM shows WHERE id = $1', [showId]);
    if (!exists.rowCount) throw new HttpError(404, 'Show not found.');
    const q = await pool.query(
      `SELECT seat_label, status, user_id,
              GREATEST(0, EXTRACT(EPOCH FROM (hold_expires_at - NOW())))::int AS seconds_left
       FROM show_seats
       WHERE show_id = $1 AND (status = 'BOOKED' OR hold_expires_at > NOW())`, [showId]);
    const taken = new Map(q.rows.map((x) => [x.seat_label, x]));
    const mine = q.rows.filter((x) => x.status === 'HELD' && x.user_id === req.user.id);
    const seats = ALL_SEATS.map((label) => {
      const t = taken.get(label);
      return {
        label,
        status: !t ? 'available' : t.status === 'BOOKED' ? 'booked' : 'held',
        mine: !!t && t.user_id === req.user.id,
      };
    });
    res.json({
      showId, rows: ROWS, columns: COLS,
      available: TOTAL_SEATS - q.rowCount,
      seats,
      myHold: mine.length
        ? { seats: mine.map((x) => x.seat_label).sort(seatSort), secondsLeft: Math.min(...mine.map((x) => x.seconds_left)) }
        : null,
    });
  }));

  // ---- Hold seats for 5 minutes.
  r.post('/shows/:id/hold', authenticate, wrap(async (req, res) => {
    const showId = parseId(req.params.id);
    const seats = parseSeats(req.body.seats);

    const result = await withTx(pool, async (db) => {
      const show = await getBookableShow(db, showId);
      // Housekeeping: free every expired hold.
      await db.query(`DELETE FROM show_seats WHERE status = 'HELD' AND hold_expires_at <= NOW()`);

      const failed = [];
      for (const seat of seats) {
        // One atomic statement per seat. The PRIMARY KEY (show_id, seat_label) is the referee:
        //  - seat free            -> row inserted, we own it
        //  - our own hold         -> hold is refreshed
        //  - held by someone else but expired -> we take it over
        //  - booked / actively held by someone else -> WHERE is false, nothing is returned
        // If two users insert the same seat at the same moment, Postgres makes the second wait for the
        // first to finish and then applies the WHERE, so exactly one of them wins.
        const ins = await db.query(
          `INSERT INTO show_seats (show_id, seat_label, status, user_id, hold_expires_at)
           VALUES ($1, $2, 'HELD', $3, NOW() + make_interval(secs => $4))
           ON CONFLICT (show_id, seat_label) DO UPDATE
             SET user_id = EXCLUDED.user_id, hold_expires_at = EXCLUDED.hold_expires_at
             WHERE show_seats.status = 'HELD'
               AND (show_seats.user_id = EXCLUDED.user_id OR show_seats.hold_expires_at <= NOW())
           RETURNING seat_label`,
          [showId, seat, req.user.id, HOLD_SECONDS]);
        if (!ins.rowCount) failed.push(seat);
      }
      if (failed.length) {
        const label = failed.join(', ');
        throw new HttpError(
          409,
          failed.length === 1
            ? `Seat ${label} was just taken by someone else. Please choose another seat.`
            : `Seats ${label} were just taken by someone else. Please choose other seats.`,
          { unavailable: failed });
      }
      // The user changed their mind: release any earlier hold of theirs that is not in the new selection.
      await db.query(
        `DELETE FROM show_seats WHERE show_id = $1 AND user_id = $2 AND status = 'HELD' AND seat_label <> ALL($3::text[])`,
        [showId, req.user.id, seats]);
      return { seats, total: show.price * seats.length };
    });
    res.status(201).json({ ...result, secondsLeft: HOLD_SECONDS });
  }));

  // ---- Release my hold ("Change seats").
  r.delete('/shows/:id/hold', authenticate, wrap(async (req, res) => {
    const showId = parseId(req.params.id);
    await pool.query(`DELETE FROM show_seats WHERE show_id = $1 AND user_id = $2 AND status = 'HELD'`, [showId, req.user.id]);
    res.status(204).end();
  }));

  // ---- Fake payment. body: { result: 'success' | 'failure', seats?: [...] }
  r.post('/shows/:id/pay', authenticate, wrap(async (req, res) => {
    const showId = parseId(req.params.id);
    const { result } = req.body;
    if (result !== 'success' && result !== 'failure') throw new HttpError(400, 'Invalid payment result.');

    const booking = await withTx(pool, async (db) => {
      const show = await getBookableShow(db, showId);
      // Lock my held rows for this show so nothing can change them while we confirm.
      const held = await db.query(
        `SELECT seat_label, (hold_expires_at > NOW()) AS active
         FROM show_seats WHERE show_id = $1 AND user_id = $2 AND status = 'HELD' ORDER BY seat_label FOR UPDATE`,
        [showId, req.user.id]);
      if (!held.rowCount || held.rows.some((x) => !x.active)) {
        throw new HttpError(410, 'Your 5-minute hold has expired. Please select your seats again.');
      }
      const seats = held.rows.map((x) => x.seat_label).sort(seatSort);
      if (req.body.seats && JSON.stringify(parseSeats(req.body.seats)) !== JSON.stringify(seats)) {
        throw new HttpError(409, 'Your selection no longer matches your held seats. Please refresh.');
      }
      if (result === 'failure') {
        // No booking is created; the seats stay held until the original expiry.
        return null;
      }
      const total = show.price * seats.length;
      const b = await db.query(
        `INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, 'CONFIRMED') RETURNING id`,
        [req.user.id, showId, total]);
      const bookingId = b.rows[0].id;
      await db.query(
        `INSERT INTO booking_seats (booking_id, seat_label) SELECT $1, UNNEST($2::text[])`, [bookingId, seats]);
      await db.query(
        `UPDATE show_seats SET status = 'BOOKED', booking_id = $3, hold_expires_at = NULL
         WHERE show_id = $1 AND user_id = $2 AND status = 'HELD'`, [showId, req.user.id, bookingId]);
      return bookingId;
    });

    if (booking === null) {
      const left = await pool.query(
        `SELECT GREATEST(0, EXTRACT(EPOCH FROM (MIN(hold_expires_at) - NOW())))::int AS s
         FROM show_seats WHERE show_id = $1 AND user_id = $2 AND status = 'HELD'`, [showId, req.user.id]);
      return res.status(402).json({
        error: 'Payment failed. Your seats are still held, so you can try again.',
        secondsLeft: left.rows[0].s ?? 0,
      });
    }
    res.status(201).json({ bookingId: booking });
  }));

  return r;
}
