import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { HttpError } from './lib.js';
import { authenticate as makeAuth, requireAdmin } from './middleware.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import seatRoutes from './routes/seats.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT / COUNT(*) come back as numbers, not strings

export function createPool(url) {
  return new pg.Pool({ connectionString: url });
}

export function createApp(pool) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set (see server/.env.example)');
  const app = express();
  const allowed = new Set([
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'http://127.0.0.1:5173', 'http://127.0.0.1:5175', process.env.CLIENT_ORIGIN,
  ].filter(Boolean));
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowed.has(origin)) }));
  app.use(express.json({ limit: '100kb' }));

  const authenticate = makeAuth(pool);
  app.get('/api/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
    catch { res.status(503).json({ ok: false, database: 'unreachable' }); }
  });
  app.use('/api/auth', authRoutes(pool, authenticate));
  app.use('/api', catalogRoutes(pool));
  app.use('/api', seatRoutes(pool, authenticate));
  app.use('/api/bookings', bookingRoutes(pool, authenticate));
  app.use('/api/admin', adminRoutes(pool, authenticate, requireAdmin));

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });
  return app;
}
