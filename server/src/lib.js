import jwt from 'jsonwebtoken';

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const COLS = 10;
export const TOTAL_SEATS = ROWS.length * COLS; // 80
export const MAX_SEATS = 6;
export const HOLD_SECONDS = 5 * 60;
export const CANCEL_CUTOFF_HOURS = 2;
export const ALL_SEATS = ROWS.flatMap((r) => Array.from({ length: COLS }, (_, i) => `${r}${i + 1}`));

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Express 4 does not catch rejected promises, so every async handler is wrapped.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function withTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const parseId = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
};

export const signToken = (user) =>
  jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Sorting every seat list the same way means two transactions always lock rows in the same
// order, so they cannot deadlock each other.
export const seatSort = (a, b) =>
  ROWS.indexOf(a[0]) - ROWS.indexOf(b[0]) || Number(a.slice(1)) - Number(b.slice(1));

// SQL fragment: how many seats of show "s" are taken (booked, or held and not yet expired).
export const TAKEN_SQL = `(SELECT COUNT(*) FROM show_seats ss
   WHERE ss.show_id = s.id AND (ss.status = 'BOOKED' OR ss.hold_expires_at > NOW()))`;
