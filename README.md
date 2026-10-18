# Yozigo — Movie Ticket Booking

A responsive movie-ticket booking prototype built for the Yozigo Full-Stack Developer Intern assignment.

## Features
- Browse a movie catalogue with genre filters and search
- View cinema showtimes, date selection, format and ticket prices
- Interactive seat selection (up to 8 seats) with occupied-seat states
- Checkout summary, fee breakdown and demo confirmation ticket
- Booking history persisted in the browser
- Sign up and sign in modal with name, email, password confirmation and validation
- Expanded 16-film catalogue with sample showtimes across the catalogue
- Database-backed sign-up/sign-in with bcrypt password hashing and JWT sessions
- Booking entry and booking confirmation require a signed-in account; the server also checks the JWT
- REST API with movies, showtimes, registration, login, booking creation and booking history
- PostgreSQL schema with relational tables and constraints
- Responsive mobile and desktop layouts

> **Important:** This is a take-home starter implementation. The checkout is a demo and does not charge money. Browser demo bookings are local-only. Real account and booking persistence requires PostgreSQL and server auth. Review every flow against the exact assignment document before submission.

## Tech stack
- Frontend: React, TypeScript, Vite, Lucide
- Backend: Node.js, Express
- SQL: PostgreSQL (`pg`)
- Auth API: bcrypt password hashing + JWT
- Demo mode: movie/showtime catalogue remains available without database configuration

## Run locally
Requirements: Node.js 20+ and npm. PostgreSQL is optional for the visual demo and required for persisted accounts/bookings.

```bash
npm install
npm run install:all
cp server/.env.example server/.env
# Set DATABASE_URL and JWT_SECRET in server/.env for database-backed endpoints
npm run dev
```

Frontend: http://localhost:5173  
API health: http://localhost:4000/api/health

The movie catalogue can run in demo mode without PostgreSQL, but account registration, sign-in, and ticket bookings are disabled until PostgreSQL and JWT_SECRET are configured. The UI never falls back to storing plaintext demo passwords in localStorage.

## Database setup
Create a database named `yozigo_movies`, then run:

```bash
psql "$DATABASE_URL" -f server/db/schema.sql
psql "$DATABASE_URL" -f server/db/seed.sql
```

Schema entities:
- `users`: account identity and bcrypt password hash
- `movies`: movie catalogue
- `shows`: cinema, date/time, format and price for a movie
- `bookings`: booking owner, show, amount, status and timestamp
- `booking_seats`: seats selected for a booking

Seed the movie and show tables with `server/db/seed.sql`. The IDs intentionally match the frontend demo catalogue, so booking IDs map to database rows.

## Demo usage / test logins
- No login is needed to explore the 16-film catalogue, showtimes, seats, checkout, confirmation, and browser booking history.
- Sign up and sign in modal with name, email, password confirmation and validation
- Expanded 16-film catalogue with sample showtimes across the catalogue
- Sign up and sign in require PostgreSQL and JWT_SECRET. No browser-only authentication fallback is provided.
- Booking confirmation sends the selected show and seats to the protected backend endpoint; the server rejects requests without a valid JWT.
- API registration requires a configured database and password of at least 8 characters. API login uses the registered email/password.

## API routes
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/movies` | Movie catalogue |
| GET | `/api/movies/:id` | Movie detail |
| GET | `/api/shows?movieId=1` | Showtimes |
| POST | `/api/auth/register` | Create account (DB required) |
| POST | `/api/auth/login` | Login (DB required) |
| POST | `/api/bookings` | Save booking (Bearer JWT + DB required) |
| GET | `/api/bookings/me` | Current user's bookings (Bearer JWT + DB required) |

## Key decisions
1. Prioritised the main booking journey: movie → showtime → seats → review → confirmation.
2. Kept checkout explicitly demo-only; no payment gateway or real charge is simulated as completed.
3. Added API fallback sample data so the frontend is easy to review without configuring a database.
4. Stored demo history in `localStorage`; production booking history should come from authenticated API endpoints.
5. Seat booking API uses a transaction and row lock, but production-grade concurrent seat locking should use a dedicated `seat_inventory` table with a unique `(show_id, seat_number)` constraint and an expiry for temporary holds.
6. Use environment variables for secrets and DB connection; never commit `.env`.

## Test log (manual smoke-test checklist)
- [ ] Home page renders and movie posters load
- [ ] Search filters by title and genre
- [ ] Genre filter updates the catalogue
- [ ] Movie opens showtimes
- [ ] Date switcher updates show availability
- [ ] Selecting a show opens seat map
- [ ] Occupied seats cannot be selected
- [ ] Seat selection toggles and caps at 8 seats
- [ ] Checkout totals match ticket price × seats + convenience fee
- [ ] Confirming creates a demo receipt and browser history item
- [ ] My bookings lists previously confirmed demo tickets after refresh
- [ ] Empty search and empty booking states render correctly
- [ ] Mobile layout works at narrow viewport widths
- [ ] API health endpoint responds
- [ ] With PostgreSQL configured: registration/login and persisted booking endpoints work

## Before submitting
- Match the 10 flows and acceptance criteria against the hiring team's brief.
- Seed PostgreSQL with the movies/shows and verify all API-backed paths.
- Add automated tests and deploy frontend/API if time permits.
- Record a 3–5 minute demo showing flows in sequence.


## Expanded movie catalogue
The catalogue now includes 50 movies, with a larger Romance section. After applying the updated files, run `psql -d cineva -f server/db/seed.sql` to add the extra movies and showtimes to an existing database.
