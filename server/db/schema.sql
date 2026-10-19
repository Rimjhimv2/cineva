-- Cineva schema (PostgreSQL 13+). Safe to run more than once.
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for the "no overlapping shows" constraint

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movies (
  id          BIGSERIAL PRIMARY KEY,
  title       VARCHAR(180) NOT NULL,
  genre       VARCHAR(120) NOT NULL,
  duration    SMALLINT NOT NULL CHECK (duration > 0),
  rating      NUMERIC(3,1),                                   -- audience score, shown with a star
  language    VARCHAR(60) NOT NULL,
  certificate VARCHAR(4) NOT NULL CHECK (certificate IN ('U','UA','A')),
  description TEXT NOT NULL DEFAULT '',
  poster      TEXT NOT NULL DEFAULT ''
);

-- One cinema, one screen. ends_at = starts_at + movie duration (kept in sync by the API).
-- The EXCLUDE constraint makes the database itself refuse two overlapping shows on a screen.
CREATE TABLE IF NOT EXISTS shows (
  id        BIGSERIAL PRIMARY KEY,
  movie_id  BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  screen    SMALLINT NOT NULL DEFAULT 1,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at   TIMESTAMPTZ NOT NULL,
  price     NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  CHECK (ends_at > starts_at),
  CONSTRAINT shows_no_overlap EXCLUDE USING gist (screen WITH =, tstzrange(starts_at, ends_at) WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_shows_movie_start ON shows(movie_id, starts_at);

CREATE TABLE IF NOT EXISTS bookings (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  show_id      BIGINT NOT NULL REFERENCES shows(id),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  status       VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_show ON bookings(show_id);

-- Permanent record of which seats a booking contains (kept even after cancellation).
CREATE TABLE IF NOT EXISTS booking_seats (
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_label VARCHAR(4) NOT NULL,
  PRIMARY KEY (booking_id, seat_label)
);

-- THE ANTI-DOUBLE-BOOKING TABLE.
-- A row exists only while a seat is held or booked. PRIMARY KEY (show_id, seat_label)
-- means the database can never contain two claims on the same seat of the same show.
-- Cancelling a booking or an expired hold simply removes the row.
CREATE TABLE IF NOT EXISTS show_seats (
  show_id         BIGINT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_label      VARCHAR(4) NOT NULL CHECK (seat_label ~ '^[A-H]([1-9]|10)$'),
  status          VARCHAR(6) NOT NULL CHECK (status IN ('HELD','BOOKED')),
  user_id         BIGINT NOT NULL REFERENCES users(id),
  booking_id      BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
  hold_expires_at TIMESTAMPTZ,
  PRIMARY KEY (show_id, seat_label),
  CHECK ((status = 'HELD'   AND hold_expires_at IS NOT NULL AND booking_id IS NULL)
      OR (status = 'BOOKED' AND booking_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_show_seats_user ON show_seats(show_id, user_id);
