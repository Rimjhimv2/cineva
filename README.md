Cineva — Movie Ticket Booking App

Cineva is a full-stack movie ticket booking app. Users can browse and search movies, filter by genre, pick a show and seats, and confirm a booking. Accounts and bookings are stored in a PostgreSQL database.

Payment is a demo only. No real money is collected.

Features
Browse 49 movies with posters, rating, duration, certificate and language
Search by title, genre or language (multi-word, e.g. romance hindi) and filter by genre
Sign up and sign in (passwords hashed with bcrypt, JWT session)
Choose a date, a cinema show and up to 8 seats on a seat map
Booking is saved in the database; the server rejects seats that were just booked by someone else
"My bookings" page with ticket details
Poster fallback: if a poster image fails to load, it is fetched from Wikipedia, and if that fails a title card is shown
Tech stack
Part	Technology
Frontend	React 18, TypeScript, Vite, lucide-react icons, plain CSS
Backend	Node.js, Express (REST API), pg, bcryptjs, jsonwebtoken, dotenv, cors
Database	PostgreSQL (SQL)
Project structure
cineva/
├── client/            React + Vite frontend
│   └── src/App.tsx    All screens and logic
├── server/            Express API
│   ├── src/index.js   Routes, auth, booking transaction
│   └── db/
│       ├── schema.sql Tables, keys, indexes
│       └── seed.sql   Movies, shows and a test user
└── package.json       Root scripts (runs client and server together)
How to run

Requirements: Node.js 20+ and PostgreSQL 14+.

1. Install PostgreSQL (macOS)
bash
brew install postgresql@16
brew services start postgresql@16
2. Create the database and load the data

Run these from the project root:

bash
createdb cineva
psql cineva -f server/db/schema.sql
psql cineva -f server/db/seed.sql
3. Create server/.env
bash
cp server/.env.example server/.env

Then open server/.env and set your values:

Variable	Meaning	Example
PORT	API port	4000
DATABASE_URL	PostgreSQL connection string	postgresql://yourname@localhost:5432/cineva
JWT_SECRET	Secret used to sign login tokens. Use a long random value: openssl rand -hex 32	3f9a...
CLIENT_ORIGIN	Frontend URL allowed by CORS (localhost ports 5173–5175 are always allowed)	http://localhost:5173

Optional, for the client (client/.env): VITE_API_URL (default http://localhost:4000/api).

4. Install and start
bash
npm run install:all
npm run dev
Frontend: http://localhost:5173
API health check: http://localhost:4000/api/health (should show "database":"configured")

If the health check shows "database":"demo-mode", the server did not find server/.env. Check the file location and restart.

Test login
Email	Password
demo@cineva.com	Demo@1234

This user is created by seed.sql. You can also create your own account with Sign up (password must be at least 8 characters).

API endpoints
Method	Route	Auth	Purpose
GET	/api/health	No	Server and database status
GET	/api/movies	No	List movies
GET	/api/movies/:id	No	One movie
GET	/api/shows?movieId=	No	Shows of a movie
POST	/api/auth/register	No	Create account, returns token
POST	/api/auth/login	No	Sign in, returns token
POST	/api/bookings	Yes	Book seats for a show
GET	/api/bookings/me	Yes	Bookings of the logged-in user
Database design

SQL database: PostgreSQL. Schema file: server/db/schema.sql.

makes
is booked in
has
contains
USERS
BOOKINGS
SHOWS
MOVIES
BOOKING_SEATS
users
Column	Type	Notes
id	BIGSERIAL	Primary key
name	VARCHAR(100)	Required
email	VARCHAR(255)	Required, unique
password_hash	TEXT	bcrypt hash, never the plain password
created_at	TIMESTAMPTZ	Default NOW()
movies
Column	Type	Notes
id	BIGSERIAL	Primary key
title	VARCHAR(180)	Required
genre	VARCHAR(120)	Required, e.g. Romance / Comedy
duration	SMALLINT	Minutes, must be > 0
rating	NUMERIC(2,1)	
language	VARCHAR(60)	Required
certificate	VARCHAR(12)	U, UA, A, etc.
description	TEXT	Required
poster	TEXT	Poster image URL
shows
Column	Type	Notes
id	BIGSERIAL	Primary key
movie_id	BIGINT	Foreign key → movies(id), ON DELETE CASCADE
cinema	VARCHAR(180)	Required
area	VARCHAR(100)	Required
show_date	DATE	Required
show_time	TIME	Required
price	NUMERIC(8,2)	Per ticket, must be >= 0
format	VARCHAR(20)	2D, 3D, IMAX; default 2D

Unique: (movie_id, cinema, show_date, show_time, format). Index: (movie_id, show_date).

bookings
Column	Type	Notes
id	BIGSERIAL	Primary key
user_id	BIGINT	Foreign key → users(id)
show_id	BIGINT	Foreign key → shows(id)
total_amount	NUMERIC(10,2)	Tickets + Rs 25 convenience fee
status	VARCHAR(20)	CONFIRMED or CANCELLED (check constraint)
created_at	TIMESTAMPTZ	Default NOW()

Index: (user_id, created_at DESC) for the "My bookings" query.

booking_seats
Column	Type	Notes
id	BIGSERIAL	Primary key
booking_id	BIGINT	Foreign key → bookings(id), ON DELETE CASCADE
seat_number	VARCHAR(5)	e.g. C7

Unique: (booking_id, seat_number).

Relationships
One user has many bookings (bookings.user_id).
One movie has many shows (shows.movie_id).
One show has many bookings (bookings.show_id).
One booking has one or more seats (booking_seats.booking_id).
Important technical decisions
PostgreSQL with relational design. Users, movies, shows, bookings and seats are separate tables with foreign keys, so data stays consistent (a booking can't point to a missing show or user).
Booking runs in a transaction. POST /api/bookings does BEGIN, locks the show row with SELECT ... FOR UPDATE, checks that none of the requested seats are already CONFIRMED for that show, inserts the booking and its seats, then COMMIT (or ROLLBACK on any error). Because of the lock, two people booking the same show at the same moment are handled one after the other, and the second one gets a 409 "seats just booked" message.
Passwords are hashed with bcrypt (12 rounds); only the hash is stored. Login failures say "Invalid email or password" without telling which part was wrong.
JWT authentication. The token (7 days) is sent in the Authorization: Bearer header and verified by the server on protected routes. Booking requires a signed-in user.
The server decides the price. The total is calculated on the server from the show price, not trusted from the browser.
Parameterised SQL ($1, $2 ...) everywhere, to prevent SQL injection.
Secrets in .env. .env is git-ignored; .env.example has only placeholders.
Graceful poster loading. Several poster URLs can fail, so a failed image tries Wikipedia and then shows a title card instead of an empty box.
Known limitations (honest notes)
Payment is a demo. There is no payment gateway.
Occupied seats on the seat map are fixed sample seats. The map does not yet read other users' bookings from the database. The server still blocks double booking and shows a clear error, but a future improvement is an endpoint that returns booked seats per show so the map can grey them out.
No database-level seat uniqueness yet. Double booking is prevented by the transaction and row lock. A stronger version would store show_id in booking_seats and add UNIQUE (show_id, seat_number) for active bookings.
Show list and the "My bookings" page use data stored in the frontend / browser for the demo (the show list matches the seeded shows ids). The API route GET /api/bookings/me already exists to move this fully to the database.
Demo shows exist for 19 Oct 2026 only.
Several movie poster URLs from TMDB are invalid; the Wikipedia fallback covers them when the internet is available.
Live link

Not deployed (optional). The frontend can be deployed on Vercel and the backend with a managed PostgreSQL on a service such as Render; set DATABASE_URL, JWT_SECRET and CLIENT_ORIGIN as environment variables, and VITE_API_URL on the frontend.
