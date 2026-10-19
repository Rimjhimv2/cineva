import { Router } from 'express';
import { HttpError, wrap, withTx, parseId, TOTAL_SEATS } from '../lib.js';

const CERTS = ['U', 'UA', 'A'];

function parseMovie(b) {
  const title = String(b.title ?? '').trim();
  const genre = String(b.genre ?? '').trim();
  const language = String(b.language ?? '').trim();
  const certificate = String(b.certificate ?? '').trim().toUpperCase();
  const duration = Number(b.duration);
  const rating = b.rating === '' || b.rating == null ? null : Number(b.rating);
  if (!title) throw new HttpError(400, 'Title is required.');
  if (!genre) throw new HttpError(400, 'Genre is required.');
  if (!language) throw new HttpError(400, 'Language is required.');
  if (!CERTS.includes(certificate)) throw new HttpError(400, 'Rating must be U, UA or A.');
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) throw new HttpError(400, 'Duration must be 1 to 600 minutes.');
  if (rating !== null && (Number.isNaN(rating) || rating < 0 || rating > 10)) throw new HttpError(400, 'Score must be between 0 and 10.');
  return { title, genre, language, certificate, duration, rating, description: String(b.description ?? '').trim(), poster: String(b.poster ?? '').trim() };
}

const overlapError = () => new HttpError(409, 'This show overlaps another show on the screen. Pick a time after the previous show ends.');

export default function adminRoutes(pool, authenticate, requireAdmin) {
  const r = Router();
  r.use(authenticate, requireAdmin);

  // ---------- movies ----------
  r.post('/movies', wrap(async (req, res) => {
    const m = parseMovie(req.body);
    const q = await pool.query(
      `INSERT INTO movies (title, genre, duration, rating, language, certificate, description, poster)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title, genre, duration, rating::float8 AS rating, language, certificate, description, poster`,
      [m.title, m.genre, m.duration, m.rating, m.language, m.certificate, m.description, m.poster]);
    res.status(201).json(q.rows[0]);
  }));

  r.put('/movies/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const m = parseMovie(req.body);
    const out = await withTx(pool, async (db) => {
      const q = await db.query(
        `UPDATE movies SET title=$2, genre=$3, duration=$4, rating=$5, language=$6, certificate=$7, description=$8, poster=$9
         WHERE id=$1 RETURNING id, title, genre, duration, rating::float8 AS rating, language, certificate, description, poster`,
        [id, m.title, m.genre, m.duration, m.rating, m.language, m.certificate, m.description, m.poster]);
      if (!q.rowCount) throw new HttpError(404, 'Movie not found.');
      try {
        // A longer/shorter movie changes when its future shows end; the DB re-checks overlaps.
        await db.query(
          `UPDATE shows SET ends_at = starts_at + make_interval(mins => $2) WHERE movie_id = $1 AND starts_at > NOW()`, [id, m.duration]);
      } catch (e) {
        if (e.code === '23P01') throw new HttpError(409, 'The new duration would make this movie\'s shows overlap another show.');
        throw e;
      }
      return q.rows[0];
    });
    res.json(out);
  }));

  r.delete('/movies/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const used = await pool.query(
      `SELECT 1 FROM bookings b JOIN shows s ON s.id = b.show_id WHERE s.movie_id = $1 LIMIT 1`, [id]);
    if (used.rowCount) throw new HttpError(409, 'This movie has shows with bookings, so it cannot be deleted.');
    const q = await pool.query('DELETE FROM movies WHERE id = $1', [id]);
    if (!q.rowCount) throw new HttpError(404, 'Movie not found.');
    res.status(204).end();
  }));

  // ---------- shows ----------
  r.post('/shows', wrap(async (req, res) => {
    const movieId = Number(req.body.movieId);
    const price = Number(req.body.price);
    const startsAt = new Date(req.body.startsAt);
    if (!Number.isInteger(movieId) || movieId <= 0) throw new HttpError(400, 'Choose a movie.');
    if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Enter a valid date and start time.');
    if (startsAt <= new Date()) throw new HttpError(400, 'The show must start in the future.');
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Enter a valid ticket price.');
    try {
      const q = await pool.query(
        `INSERT INTO shows (movie_id, starts_at, ends_at, price)
         SELECT m.id, $2::timestamptz, $2::timestamptz + make_interval(mins => m.duration), $3
         FROM movies m WHERE m.id = $1
         RETURNING id, movie_id AS "movieId", starts_at AS "startsAt", ends_at AS "endsAt", price::float8 AS price`,
        [movieId, startsAt.toISOString(), price]);
      if (!q.rowCount) throw new HttpError(404, 'Movie not found.');
      res.status(201).json(q.rows[0]);
    } catch (e) {
      if (e.code === '23P01') throw overlapError(); // exclusion constraint shows_no_overlap
      throw e;
    }
  }));

  r.delete('/shows/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const used = await pool.query('SELECT 1 FROM bookings WHERE show_id = $1 LIMIT 1', [id]);
    if (used.rowCount) throw new HttpError(409, 'This show already has bookings, so it cannot be deleted.');
    const q = await pool.query('DELETE FROM shows WHERE id = $1', [id]);
    if (!q.rowCount) throw new HttpError(404, 'Show not found.');
    res.status(204).end();
  }));

  // Bonus flow 9: occupancy and revenue per show.
  r.get('/shows', wrap(async (_req, res) => {
    const q = await pool.query(
      `SELECT s.id, s.movie_id AS "movieId", m.title, s.starts_at AS "startsAt", s.ends_at AS "endsAt",
              s.price::float8 AS price, (s.starts_at <= NOW()) AS started,
              (SELECT COUNT(*) FROM show_seats ss WHERE ss.show_id = s.id AND ss.status = 'BOOKED')::int AS booked,
              COALESCE((SELECT SUM(b.total_amount) FROM bookings b WHERE b.show_id = s.id AND b.status = 'CONFIRMED'), 0)::float8 AS revenue
       FROM shows s JOIN movies m ON m.id = s.movie_id
       ORDER BY (s.starts_at < NOW()), s.starts_at`);
    res.json(q.rows.map((s) => ({ ...s, totalSeats: TOTAL_SEATS, percentFull: Math.round((s.booked / TOTAL_SEATS) * 100) })));
  }));

  r.get('/shows/:id/bookings', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const q = await pool.query(
      `SELECT b.id, u.name AS "customerName", u.email AS "customerEmail", b.status, b.created_at AS "bookedAt",
              b.total_amount::float8 AS "totalAmount",
              ARRAY(SELECT seat_label FROM booking_seats bs WHERE bs.booking_id = b.id
                    ORDER BY LEFT(seat_label, 1), LENGTH(seat_label), seat_label) AS seats
       FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.show_id = $1 ORDER BY b.created_at DESC`, [id]);
    res.json(q.rows);
  }));

  return r;
}
