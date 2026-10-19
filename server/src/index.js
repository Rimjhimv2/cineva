import 'dotenv/config';
import { createPool, createApp } from './app.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}
const pool = createPool(process.env.DATABASE_URL);
const app = createApp(pool);

// Housekeeping only: expired holds are already ignored by every query, this just keeps the table small.
setInterval(() => {
  pool.query(`DELETE FROM show_seats WHERE status = 'HELD' AND hold_expires_at <= NOW()`).catch(() => {});
}, 30_000).unref();

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Cineva API listening on http://localhost:${port}`));
