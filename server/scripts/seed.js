// Creates the admin + test customer, the movies, and a two-week show schedule.
// Usage: npm run db:seed   (safe to re-run: users are upserted, shows without bookings are regenerated)
import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const movies = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../db/movies.json', import.meta.url)), 'utf8'));

export const ADMIN = { name: 'Cineva Admin', email: 'admin@cineva.com', password: 'Admin@1234' };
export const CUSTOMER = { name: 'Demo Customer', email: 'demo@cineva.com', password: 'Demo@1234' };

const DAYS = 14;
const FIRST_HOUR = 10;      // first show of a day starts at 10:00
const LAST_END_HOUR = 24;   // no show may end after midnight
const GAP_MIN = 20;         // cleaning gap between shows
const PRICES = [160, 180, 200, 220, 240];

export async function seed(client) {
  for (const [u, role] of [[ADMIN, 'admin'], [CUSTOMER, 'customer']]) {
    const hash = await bcrypt.hash(u.password, 12);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [u.name, u.email, hash, role]);
  }

  for (const m of movies) {
    await client.query(
      `INSERT INTO movies (title, genre, duration, rating, language, certificate, description, poster)
       SELECT $1::varchar,$2,$3,$4,$5,$6,$7,$8 WHERE NOT EXISTS (SELECT 1 FROM movies WHERE title = $1::varchar)`,
      [m.title, m.genre, m.duration, m.rating, m.language, m.certificate, m.description, m.poster]);
  }
  const all = (await client.query('SELECT id, duration FROM movies ORDER BY id')).rows;

  // Rebuild the schedule, but never touch shows that already have bookings.
  await client.query('DELETE FROM shows WHERE id NOT IN (SELECT show_id FROM bookings)');

  // One screen: lay shows end-to-end, day by day, cycling through the movie list. No overlaps by construction
  // (and the database would reject them anyway). Times are the cinema's local times (SEED_TIMEZONE).
  const tz = process.env.SEED_TIMEZONE || 'Asia/Kolkata';
  const t = (await client.query(
    `SELECT (NOW() AT TIME ZONE $1)::date::text AS today,
            (EXTRACT(HOUR FROM NOW() AT TIME ZONE $1) * 60 + EXTRACT(MINUTE FROM NOW() AT TIME ZONE $1))::int AS now_min`, [tz])).rows[0];
  const round15 = (n) => Math.ceil(n / 15) * 15;
  let day = 0;
  let cursor = Math.max(FIRST_HOUR * 60, round15(t.now_min + 60)); // minutes after local midnight of `day`
  let i = 0, created = 0;
  while (day < DAYS) {
    const m = all[i % all.length];
    if (cursor + m.duration > LAST_END_HOUR * 60) { day += 1; cursor = FIRST_HOUR * 60; continue; } // would pass midnight
    const r = await client.query(
      `INSERT INTO shows (movie_id, starts_at, ends_at, price)
       SELECT $1, ts, ts + make_interval(mins => $4::int), $5
       FROM (SELECT (($2::date + make_interval(days => $6::int, mins => $3::int)) AT TIME ZONE $7) AS ts) x
       ON CONFLICT DO NOTHING`,
      [m.id, t.today, cursor, m.duration, PRICES[(i * 7) % PRICES.length], day, tz]);
    created += r.rowCount;
    i += 1;
    cursor = round15(cursor + m.duration + GAP_MIN);
  }
  return { movies: all.length, shows: created };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const out = await seed(client);
  await client.end();
  console.log(`Seeded ${out.movies} movies and ${out.shows} shows.`);
  console.log(`Admin:    ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`Customer: ${CUSTOMER.email} / ${CUSTOMER.password}`);
}
