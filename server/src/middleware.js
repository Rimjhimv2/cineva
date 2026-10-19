import jwt from 'jsonwebtoken';
import { HttpError, wrap } from './lib.js';

// Verifies the JWT and loads the user from the database, so the role is always current
// and a deleted user's old token stops working.
export const authenticate = (pool) =>
  wrap(async (req, _res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Please sign in to continue.');
    }
    const r = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [payload.id]);
    if (!r.rowCount) throw new HttpError(401, 'Please sign in to continue.');
    req.user = r.rows[0];
    next();
  });

export const requireAdmin = (req, _res, next) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required.'));
