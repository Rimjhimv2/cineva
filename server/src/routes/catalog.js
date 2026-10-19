import { Router } from 'express';
import { HttpError, wrap, parseId, TAKEN_SQL, TOTAL_SEATS } from '../lib.js';

const SHOW_COLS = `s.id, s.movie_id AS "movieId", s.starts_at AS "startsAt", s.ends_at AS "endsAt",
  s.price::float8 AS price, (${TOTAL_SEATS} - ${TAKEN_SQL})::int AS available`;

export default function catalogRoutes(pool) {
  const r = Router();

  r.get('/movies', wrap(async (_req, res) => {
    const m = await pool.query(
      `SELECT id, title, genre, duration, rating::float8 AS rating, language, certificate, description, poster
       FROM movies ORDER BY id`);
    res.json(m.rows);
  }));

  // Movie details + its upcoming shows. Shows that already started are never returned.
  r.get('/movies/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const m = await pool.query(
      `SELECT id, title, genre, duration, rating::float8 AS rating, language, certificate, description, poster
       FROM movies WHERE id = $1`, [id]);
    if (!m.rowCount) throw new HttpError(404, 'Movie not found.');
    const s = await pool.query(
      `SELECT ${SHOW_COLS} FROM shows s WHERE s.movie_id = $1 AND s.starts_at > NOW() ORDER BY s.starts_at`, [id]);
    res.json({ ...m.rows[0], shows: s.rows });
  }));

  r.get('/shows', wrap(async (req, res) => {
    const movieId = parseId(req.query.movieId);
    const s = await pool.query(
      `SELECT ${SHOW_COLS} FROM shows s WHERE s.movie_id = $1 AND s.starts_at > NOW() ORDER BY s.starts_at`, [movieId]);
    res.json(s.rows);
  }));

  r.get('/shows/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await pool.query(
      `SELECT ${SHOW_COLS}, (s.starts_at <= NOW()) AS started, m.title, m.poster, m.genre, m.duration,
              m.language, m.certificate
       FROM shows s JOIN movies m ON m.id = s.movie_id WHERE s.id = $1`, [id]);
    if (!s.rowCount) throw new HttpError(404, 'Show not found.');
    res.json(s.rows[0]);
  }));

  return r;
}
