CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE movies (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  genre VARCHAR(120) NOT NULL,
  duration SMALLINT NOT NULL CHECK (duration > 0),
  rating NUMERIC(2,1),
  language VARCHAR(60) NOT NULL,
  certificate VARCHAR(12),
  description TEXT NOT NULL,
  poster TEXT NOT NULL
);
CREATE TABLE shows (
  id BIGSERIAL PRIMARY KEY,
  movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  cinema VARCHAR(180) NOT NULL,
  area VARCHAR(100) NOT NULL,
  show_date DATE NOT NULL,
  show_time TIME NOT NULL,
  price NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  format VARCHAR(20) NOT NULL DEFAULT '2D',
  UNIQUE(movie_id, cinema, show_date, show_time, format)
);
CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  show_id BIGINT NOT NULL REFERENCES shows(id),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE booking_seats (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_number VARCHAR(5) NOT NULL,
  UNIQUE(booking_id, seat_number)
);
CREATE INDEX idx_shows_movie_date ON shows(movie_id, show_date);
CREATE INDEX idx_bookings_user_created ON bookings(user_id, created_at DESC);
-- Seed the six movie rows and showtimes using the matching sample data in server/src/index.js.
-- For production, add a partial unique index for active seat claims:
-- CREATE UNIQUE INDEX uq_active_show_seat ON booking_seats(show_id, seat_number);
-- In production, store show_id on booking_seats or enforce the constraint via a dedicated seat_inventory table.
