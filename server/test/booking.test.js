import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/helpers.js';

let t;
before(async () => { t = await startTestServer(); });
after(async () => { await t.stop(); });

const hold = (user, showId, seats) => t.call('POST', `/shows/${showId}/hold`, { token: user.token, body: { seats } });
const pay = (user, showId, result, seats) => t.call('POST', `/shows/${showId}/pay`, { token: user.token, body: { result, seats } });
const seatMap = (user, showId) => t.call('GET', `/shows/${showId}/seats`, { token: user.token });
const rowsFor = async (showId) =>
  (await t.pool.query('SELECT seat_label, status FROM show_seats WHERE show_id = $1', [showId])).rows;

describe('DOUBLE BOOKING (flow 5, the most important rule)', () => {
  test('two users hold the same seat at the same moment: exactly one succeeds', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    const results = await Promise.all([hold(a, show, ['C4']), hold(b, show, ['C4'])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const loser = results.find((r) => r.status === 409);
    assert.match(loser.body.error, /C4/);
    assert.deepEqual(loser.body.unavailable, ['C4']);
    assert.equal((await rowsFor(show)).length, 1); // the database holds one claim, never two
  });

  test('10 users fight for one seat: exactly one wins, nine are rejected', async () => {
    const show = await t.makeShow();
    const users = await Promise.all(Array.from({ length: 10 }, () => t.makeUser()));
    const results = await Promise.all(users.map((u) => hold(u, show, ['H10'])));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 9);
    assert.equal((await rowsFor(show)).length, 1);
  });

  test('overlapping multi-seat requests in opposite order: one wins, no deadlock, no partial hold', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    const results = await Promise.all([hold(a, show, ['D1', 'D2', 'D3']), hold(b, show, ['D3', 'D2', 'D1', 'D4'])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const rows = await rowsFor(show);
    assert.ok(rows.length === 3 || rows.length === 4, 'only the winner holds seats');
    const winner = results.findIndex((r) => r.status === 201) === 0 ? a : b;
    const owners = await t.pool.query('SELECT DISTINCT user_id FROM show_seats WHERE show_id = $1', [show]);
    assert.deepEqual(owners.rows.map((r) => r.user_id), [winner.id]);
  });

  test('full race at payment time: two users cannot both end up with a booking for the same seat', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    await Promise.all([hold(a, show, ['E5']), hold(b, show, ['E5'])]);
    const results = await Promise.all([pay(a, show, 'success'), pay(b, show, 'success')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 410]);
    const confirmed = await t.pool.query(
      `SELECT COUNT(*)::int AS n FROM bookings b JOIN booking_seats bs ON bs.booking_id = b.id
       WHERE b.show_id = $1 AND bs.seat_label = 'E5' AND b.status = 'CONFIRMED'`, [show]);
    assert.equal(confirmed.rows[0].n, 1);
  });

  test('a booked seat cannot be held or booked again', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    assert.equal((await hold(a, show, ['B2', 'B3'])).status, 201);
    assert.equal((await pay(a, show, 'success')).status, 201);
    const again = await hold(b, show, ['B3']);
    assert.equal(again.status, 409);
    const map = await seatMap(b, show);
    assert.equal(map.body.seats.find((s) => s.label === 'B3').status, 'booked');
    assert.equal(map.body.available, 78);
  });

  test('the database itself rejects a second claim on the same seat (even bypassing the API)', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    const sql = `INSERT INTO show_seats (show_id, seat_label, status, user_id, hold_expires_at) VALUES ($1,'A1','HELD',$2, NOW() + interval '5 min')`;
    await t.pool.query(sql, [show, a.id]);
    await assert.rejects(t.pool.query(sql, [show, b.id]), { code: '23505' });
  });
});

describe('holds and payment (flows 4 and 5)', () => {
  test('cannot select more than 6 seats, and invalid seats are rejected', async () => {
    const show = await t.makeShow();
    const u = await t.makeUser();
    const r = await hold(u, show, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /at most 6/);
    assert.equal((await hold(u, show, ['Z9'])).status, 400);
    assert.equal((await hold(u, show, ['A11'])).status, 400);
    assert.equal((await hold(u, show, [])).status, 400);
  });

  test('hold lasts 5 minutes and other users see the seat as held', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    const r = await hold(a, show, ['C4', 'C5']);
    assert.equal(r.status, 201);
    assert.equal(r.body.secondsLeft, 300);
    assert.equal(r.body.total, 400);
    const map = await seatMap(b, show);
    assert.equal(map.body.seats.find((s) => s.label === 'C4').status, 'held');
    assert.equal(map.body.myHold, null);
    const mine = await seatMap(a, show);
    assert.deepEqual(mine.body.myHold.seats, ['C4', 'C5']);
    assert.ok(mine.body.myHold.secondsLeft > 290 && mine.body.myHold.secondsLeft <= 300);
  });

  test('expired hold: seat is free for everyone and the old owner cannot pay', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    await hold(a, show, ['F6']);
    await t.pool.query(`UPDATE show_seats SET hold_expires_at = NOW() - interval '1 second' WHERE show_id = $1`, [show]);
    assert.equal((await seatMap(b, show)).body.seats.find((s) => s.label === 'F6').status, 'available');
    const late = await pay(a, show, 'success');
    assert.equal(late.status, 410);
    assert.match(late.body.error, /expired/i);
    assert.equal((await hold(b, show, ['F6'])).status, 201); // b can take it
    assert.equal((await pay(b, show, 'success')).status, 201);
  });

  test('payment failure creates no booking and keeps the hold so the user can retry', async () => {
    const show = await t.makeShow();
    const a = await t.makeUser();
    await hold(a, show, ['G1']);
    const failed = await pay(a, show, 'failure');
    assert.equal(failed.status, 402);
    assert.match(failed.body.error, /Payment failed/);
    assert.ok(failed.body.secondsLeft > 0);
    assert.equal((await t.pool.query('SELECT COUNT(*)::int n FROM bookings WHERE show_id = $1', [show])).rows[0].n, 0);
    assert.deepEqual((await seatMap(a, show)).body.myHold.seats, ['G1']);
    const ok = await pay(a, show, 'success');
    assert.equal(ok.status, 201);
    const booking = await t.call('GET', `/bookings/${ok.body.bookingId}`, { token: a.token });
    assert.equal(booking.body.status, 'CONFIRMED');
    assert.deepEqual(booking.body.seats, ['G1']);
    assert.equal(booking.body.totalAmount, 200);
  });

  test('paying without any hold is rejected', async () => {
    const show = await t.makeShow();
    const a = await t.makeUser();
    assert.equal((await pay(a, show, 'success')).status, 410);
  });

  test('re-holding a different set releases the old seats', async () => {
    const show = await t.makeShow();
    const a = await t.makeUser();
    await hold(a, show, ['A1', 'A2']);
    await hold(a, show, ['A2', 'A3']);
    assert.deepEqual((await rowsFor(show)).map((r) => r.seat_label).sort(), ['A2', 'A3']);
  });

  test('started shows cannot be held', async () => {
    const show = await t.makeShow({ startsInMinutes: -30 });
    const a = await t.makeUser();
    assert.equal((await hold(a, show, ['A1'])).status, 400);
  });
});

describe('authentication and privacy (flows 1 and 6)', () => {
  test('signup validation, duplicate email, hashed password, no admin via signup', async () => {
    const ok = await t.call('POST', '/auth/register', { body: { name: 'Asha', email: 'asha@test.com', password: 'longenough', role: 'admin' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.user.role, 'customer');
    assert.equal((await t.call('POST', '/auth/register', { body: { name: 'Asha', email: 'ASHA@test.com', password: 'longenough' } })).status, 409);
    assert.equal((await t.call('POST', '/auth/register', { body: { name: 'Bo', email: 'bo@test.com', password: 'short' } })).status, 400);
    const row = await t.pool.query(`SELECT password_hash FROM users WHERE email = 'asha@test.com'`);
    assert.match(row.rows[0].password_hash, /^\$2[aby]\$/);
    assert.notEqual(row.rows[0].password_hash, 'longenough');
  });

  test('login error never says which of email/password was wrong', async () => {
    await t.call('POST', '/auth/register', { body: { name: 'Cy', email: 'cy@test.com', password: 'longenough' } });
    const wrongPw = await t.call('POST', '/auth/login', { body: { email: 'cy@test.com', password: 'nope-nope' } });
    const wrongEmail = await t.call('POST', '/auth/login', { body: { email: 'nobody@test.com', password: 'longenough' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(wrongEmail.status, 401);
    assert.equal(wrongPw.body.error, wrongEmail.body.error);
  });

  test('protected API calls are rejected without a valid token', async () => {
    const show = await t.makeShow();
    for (const [m, p] of [['GET', '/bookings/me'], ['GET', `/shows/${show}/seats`], ['POST', `/shows/${show}/hold`], ['POST', `/shows/${show}/pay`], ['GET', '/admin/shows']]) {
      assert.equal((await t.call(m, p, { body: m === 'POST' ? {} : undefined })).status, 401, `${m} ${p}`);
    }
    assert.equal((await t.call('GET', '/bookings/me', { token: 'garbage.token.value' })).status, 401);
  });

  test('a user can never see another user\'s booking, even by guessing the ID', async () => {
    const show = await t.makeShow();
    const [a, b] = [await t.makeUser(), await t.makeUser()];
    await hold(a, show, ['A1']);
    const { bookingId } = (await pay(a, show, 'success')).body;
    assert.equal((await t.call('GET', `/bookings/${bookingId}`, { token: a.token })).status, 200);
    assert.equal((await t.call('GET', `/bookings/${bookingId}`, { token: b.token })).status, 404);
    assert.equal((await t.call('POST', `/bookings/${bookingId}/cancel`, { token: b.token })).status, 404);
    assert.deepEqual((await t.call('GET', '/bookings/me', { token: b.token })).body, []);
  });

  test('"My bookings" lists upcoming first, then past', async () => {
    const [soon, later, past] = [await t.makeShow({ startsInMinutes: 300 }), await t.makeShow({ startsInMinutes: 3000 }), await t.makeShow({ startsInMinutes: 400 })];
    const u = await t.makeUser();
    for (const [s, seat] of [[later, 'A1'], [past, 'A2'], [soon, 'A3']]) { await hold(u, s, [seat]); await pay(u, s, 'success'); }
    await t.pool.query(`UPDATE shows SET starts_at = NOW() - interval '2 days', ends_at = NOW() - interval '2 days' + interval '2 hours' WHERE id = $1`, [past]);
    const list = (await t.call('GET', '/bookings/me', { token: u.token })).body;
    assert.deepEqual(list.map((b) => b.showId), [soon, later, past]);
  });
});

describe('cancel booking (bonus flow 8)', () => {
  test('cancel frees the seats immediately; cancelling within 2 hours is rejected', async () => {
    const [far, near] = [await t.makeShow({ startsInMinutes: 600 }), await t.makeShow({ startsInMinutes: 90 })];
    const u = await t.makeUser();
    await hold(u, far, ['A1']); const b1 = (await pay(u, far, 'success')).body.bookingId;
    await hold(u, near, ['A1']); const b2 = (await pay(u, near, 'success')).body.bookingId;

    const tooLate = await t.call('POST', `/bookings/${b2}/cancel`, { token: u.token });
    assert.equal(tooLate.status, 400);
    assert.match(tooLate.body.error, /2 hours/);

    const ok = await t.call('POST', `/bookings/${b1}/cancel`, { token: u.token });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'CANCELLED');
    assert.equal((await seatMap(u, far)).body.seats.find((s) => s.label === 'A1').status, 'available');
    assert.equal((await t.call('POST', `/bookings/${b1}/cancel`, { token: u.token })).status, 400);
    const other = await t.makeUser();
    assert.equal((await hold(other, far, ['A1'])).status, 201);
  });
});

describe('admin (flow 7 and bonus 9)', () => {
  test('customers cannot call admin APIs', async () => {
    const c = await t.makeUser();
    assert.equal((await t.call('POST', '/admin/movies', { token: c.token, body: {} })).status, 403);
    assert.equal((await t.call('GET', '/admin/shows', { token: c.token })).status, 403);
    assert.equal((await t.call('POST', '/admin/shows', { token: c.token, body: {} })).status, 403);
  });

  test('admin can add/edit/delete a movie', async () => {
    const admin = await t.makeUser('admin');
    const body = { title: 'New Film', genre: 'Drama', duration: 100, language: 'Hindi', certificate: 'U', rating: 7.5, poster: '', description: 'x' };
    const created = await t.call('POST', '/admin/movies', { token: admin.token, body });
    assert.equal(created.status, 201);
    assert.equal((await t.call('POST', '/admin/movies', { token: admin.token, body: { ...body, certificate: 'PG' } })).status, 400);
    const edited = await t.call('PUT', `/admin/movies/${created.body.id}`, { token: admin.token, body: { ...body, title: 'Renamed' } });
    assert.equal(edited.body.title, 'Renamed');
    assert.equal((await t.call('DELETE', `/admin/movies/${created.body.id}`, { token: admin.token })).status, 204);
  });

  test('two shows on the same screen cannot overlap (start + movie duration)', async () => {
    const admin = await t.makeUser('admin');
    const m = (await t.call('POST', '/admin/movies', { token: admin.token, body: { title: 'Long', genre: 'Drama', duration: 120, language: 'English', certificate: 'A' } })).body.id;
    const start = new Date(Date.now() + 5 * 24 * 3600e3);
    const at = (mins) => new Date(start.getTime() + mins * 60e3).toISOString();
    const add = (mins) => t.call('POST', '/admin/shows', { token: admin.token, body: { movieId: m, startsAt: at(mins), price: 150 } });
    assert.equal((await add(0)).status, 201);
    assert.equal((await add(60)).status, 409);   // starts while the first is still running
    assert.equal((await add(-60)).status, 409);  // would still be running when the first starts
    assert.equal((await add(120)).status, 201);  // starts exactly when the first ends: allowed
    assert.match((await add(10)).body.error, /overlaps/);
  });

  test('a show with bookings cannot be deleted; an empty one can', async () => {
    const admin = await t.makeUser('admin');
    const [busy, empty] = [await t.makeShow(), await t.makeShow()];
    const u = await t.makeUser();
    await hold(u, busy, ['A1']); await pay(u, busy, 'success');
    assert.equal((await t.call('DELETE', `/admin/shows/${busy}`, { token: admin.token })).status, 409);
    assert.equal((await t.call('DELETE', `/admin/shows/${empty}`, { token: admin.token })).status, 204);
  });

  test('admin sees seats booked, % full, revenue and the booking list', async () => {
    const admin = await t.makeUser('admin');
    const show = await t.makeShow({ price: 250 });
    const u = await t.makeUser();
    await hold(u, show, ['A1', 'A2', 'A3', 'A4']); await pay(u, show, 'success');
    const row = (await t.call('GET', '/admin/shows', { token: admin.token })).body.find((s) => s.id === show);
    assert.equal(row.booked, 4);
    assert.equal(row.totalSeats, 80);
    assert.equal(row.percentFull, 5);
    assert.equal(row.revenue, 1000);
    const list = (await t.call('GET', `/admin/shows/${show}/bookings`, { token: admin.token })).body;
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].seats, ['A1', 'A2', 'A3', 'A4']);
    assert.match(list[0].customerName, /^User /);
  });
});

describe('browsing (flow 2)', () => {
  test('past shows are not listed; shows report seats still available', async () => {
    const [past, future] = [await t.makeShow({ startsInMinutes: -10 }), await t.makeShow({ startsInMinutes: 700 })];
    const u = await t.makeUser();
    await hold(u, future, ['A1', 'A2']);
    const m = (await t.call('GET', `/movies/${t.movie}`)).body;
    const ids = m.shows.map((s) => s.id);
    assert.ok(!ids.includes(past));
    assert.equal(m.shows.find((s) => s.id === future).available, 78); // held seats are not available
  });
});
