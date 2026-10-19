import 'dotenv/config';
import { createPool, createApp } from '../src/app.js';
import { applySchema } from '../scripts/migrate.js';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-secret';
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  throw new Error('Set TEST_DATABASE_URL to a database whose name contains "test" (it is wiped on every run).');
}

export async function startTestServer() {
  const pool = createPool(url);
  // Fresh database every run.
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const c = await pool.connect();
  await applySchema(c);
  c.release();

  const server = await new Promise((resolve) => { const s = createApp(pool).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  let n = 0;
  const hash = await bcrypt.hash('Password1', 4); // cheap hash: this is test data only
  const makeUser = async (role = 'customer') => {
    n += 1;
    const email = `${role}${n}@test.com`;
    const u = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`, [`User ${n}`, email, hash, role]);
    const login = await call('POST', '/auth/login', { body: { email, password: 'Password1' } });
    return { id: u.rows[0].id, email, token: login.body.token };
  };

  const movie = (await pool.query(
    `INSERT INTO movies (title, genre, duration, language, certificate) VALUES ('Test Movie','Drama',120,'English','UA') RETURNING id`)).rows[0].id;

  // Every test show lives on its own "screen" so shows never overlap each other by accident.
  let screen = 100;
  const makeShow = async ({ startsInMinutes = 600, price = 200 } = {}) => {
    screen += 1;
    const r = await pool.query(
      `INSERT INTO shows (movie_id, screen, starts_at, ends_at, price)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), NOW() + make_interval(mins => $3 + 120), $4) RETURNING id`,
      [movie, screen, startsInMinutes, price]);
    return r.rows[0].id;
  };

  const stop = async () => { await new Promise((r) => server.close(r)); await pool.end(); };
  return { pool, call, makeUser, makeShow, movie, stop };
}
