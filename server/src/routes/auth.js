import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { HttpError, wrap, signToken } from '../lib.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function authRoutes(pool, authenticate) {
  const r = Router();

  r.post('/register', wrap(async (req, res) => {
    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    const hash = await bcrypt.hash(password, 12);
    try {
      // The role is never read from the request: sign-up can only ever create customers.
      const u = await pool.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'customer')
         RETURNING id, name, email, role`, [name, email, hash]);
      res.status(201).json({ user: u.rows[0], token: signToken(u.rows[0]) });
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'An account with this email already exists.');
      throw e;
    }
  }));

  r.post('/login', wrap(async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const u = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [email]);
    // Same message for "no such user" and "wrong password" so the API does not reveal which emails exist.
    const ok = u.rowCount && (await bcrypt.compare(password, u.rows[0].password_hash));
    if (!ok) throw new HttpError(401, 'Invalid email or password.');
    const { password_hash, ...user } = u.rows[0];
    res.json({ user, token: signToken(user) });
  }));

  r.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
  return r;
}
