# 🎬 Cineva — Movie Ticket Booking Platform

Cineva is a full-stack movie ticket booking platform for a single-screen cinema. Customers can explore movies, check showtimes, pick seats on a live seat map and book tickets. Staff can manage movies and shows from an admin panel. The most important rule of the app: **a seat can never be booked twice**, even if two people click on it at the same moment.

## ✨ Features

**For customers**
- 🎥 Browse movies (title, poster, language, duration, rating U / UA / A)
- 🕒 See upcoming shows grouped by date, with price and seats left
- 💺 Live 8 × 10 seat map (rows A–H, seats 1–10) with *available / held / booked* states
- ⏳ Select 1 to 6 seats and hold them for **5 minutes** with a countdown timer
- 💳 Fake payment step with **Payment success** and **Payment failure** buttons (so both cases can be tested)
- 🎟️ My bookings: upcoming first, then past; cancel up to 2 hours before the show
- ⚡ Seat map updates by itself within about 3 seconds when other people hold or book seats

**For admins**
- 🎞️ Add, edit and delete movies
- 📅 Add shows (overlapping shows on the single screen are rejected; shows with bookings can't be deleted)
- 📊 Per-show stats: seats booked out of 80, % full, money collected, and the list of bookings

**Security**
- 🔐 Email + password login, passwords hashed with bcrypt, JWT sessions
- Every protected API call is checked on the server (not just hidden in the UI); customers can't use admin APIs or see other people's bookings

## 🛠️ Tech Stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, plain CSS |
| Backend | Node.js, Express, TypeScript (REST API) |
| Database | SQL — SQLite (`better-sqlite3`) |
| Auth | JWT + bcrypt |
| Tests | Vitest + Supertest |

## ✅ Flows completed

| Flow | Status |
| --- | --- |
| 1. Sign up / log in / log out | Done |
| 2. Browse movies and shows | Done |
| 3. Seat map | Done |
| 4. Select and hold seats (5 min, countdown) | Done |
| 5. Pay and confirm (success / failure / expired) | Done |
| 6. My bookings | Done |
| 7. Admin: movies and shows | Done |
| 8. Cancel a booking (bonus) | Done |
| 9. Admin: bookings and revenue per show (bonus) | Done |
| 10. Live seat updates (bonus, polling every 3 s) | Done |

**Not done / known gaps:** no Docker Compose, not deployed (no live link), only a basic mobile layout (the task asks for desktop). An admin can add and delete shows but not edit them, and a movie's duration can't be changed once it has shows (see decision 9).

## 📂 Project Structure

```
cineva/
├── backend/
│   ├── src/
│   │   ├── db.ts         database schema + connection
│   │   ├── app.ts        all API routes and booking rules
│   │   ├── seed.ts       test users, movies and shows
│   │   └── server.ts     starts the API
│   └── test/booking.test.ts
├── frontend/
│   └── src/
│       ├── api.ts, auth.tsx     API helper and login state
│       ├── pages/               Home, Movie, Show (seat map + payment), Bookings, Admin, Login/Signup
│       └── components/          SeatMap, Poster
└── README.md
```

## 🚀 Getting Started

You need **Node.js 20 or newer** (built and tested on Node 22). No database server is needed, SQLite is just a file.

**1. Clone the repository**

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

**2. Start the backend** (terminal 1)

```bash
cd backend
npm install
npm run seed     # optional: creates the test users, 4 movies and shows for the next 4 days
npm run dev      # API on http://localhost:4000
```

The backend also seeds itself when it starts, so the site is never empty. Set `AUTO_SEED=false` to switch that off. The database file lives at `backend/data/cinema.db`.

**3. Start the frontend** (terminal 2)

```bash
cd frontend
npm install
npm run dev      # app on http://localhost:5173  (it forwards /api to port 4000)
```

Open **http://localhost:5173**.

**4. Run the tests**

```bash
cd backend
npm test
```

**Environment variables (all optional):** `PORT` (default 4000), `DB_FILE` (default `backend/data/cinema.db`), `JWT_SECRET` (set a real secret outside development), `AUTO_SEED`.

To start fresh, stop the backend, delete the `backend/data` folder and start it again. Never commit real secrets to GitHub.

### 🔑 Test logins

| Role | Email | Password |
| --- | --- | --- |
| Customer | `customer@yozigo.test` | `Customer@123` |
| Admin | `admin@yozigo.test` | `Admin@123` |

Normal sign-up always creates a customer. The only way to get an admin is the seed script.

## 🧠 Key decisions

1. **Node + Express + TypeScript** for the backend, so the whole project is TypeScript and the request/response shapes are easy to follow. It is a separate REST API; the frontend only talks to it through `/api`.
2. **SQLite** so anyone can run the project with zero setup. The table design is plain standard SQL, so moving to PostgreSQL means changing the driver and a few small syntax bits.
3. **How double booking is prevented** (the most important part):
   - Table `seat_reservations` has `PRIMARY KEY (show_id, seat)`. The database physically cannot hold two rows for the same seat of the same show, so even a bug in my code couldn't create a double booking.
   - A seat is either *held* (row has `expires_at`) or *booked* (row has `booking_id`). Holding, paying and cancelling each run inside one transaction that takes the write lock first (`BEGIN IMMEDIATE`), so two requests are processed one after the other.
   - When someone asks for seats, the backend deletes expired holds, checks the requested seats, then inserts them. If any seat is taken, the whole transaction is rolled back and the user is told which seat (HTTP 409). No partial holds are left behind.
4. **Hold expiry without a background job.** A hold is just a row with an `expires_at` time. Every query treats an expired hold as free, and expired rows are deleted the next time someone holds seats for that show. Seats are free again the instant 5 minutes pass, and nothing gets stuck if the server restarts.
5. **Payment failure keeps the hold.** It returns an error and creates nothing; the seats stay held until the original 5 minutes end, so the user can press "Try again". Paying after expiry returns HTTP 410.
6. **JWT + bcrypt.** Every protected API route checks the token itself, and admin routes check the role in the database on every request. Login errors always say "Invalid email or password" so they don't reveal which emails exist.
7. **No peeking at other people's data.** Asking for someone else's booking returns 404 (same as a booking that doesn't exist), and "My bookings" is always filtered by the logged-in user on the server.
8. **Time handling.** Times are stored in UTC as ISO strings and shown in the viewer's local timezone. An admin types the show time in their own local time and the browser converts it.
9. **Overlapping shows.** A new show is rejected if `new_start < other_end AND new_end > other_start` for any show on the screen. Back-to-back shows are allowed. Since `ends_at` is stored when a show is created, a movie's duration can't be edited while it has shows.
10. **Live updates use polling** (every 3 seconds) instead of WebSockets or Server-Sent Events. It is the simplest to build and debug, works through any proxy, and for 80 seats a 3-second delay is fine. The cost is a little extra traffic per open seat map. With many users I would switch to Server-Sent Events.
11. **Countdown uses the server's clock.** The API sends `serverTime`, so a wrong clock on the user's computer can't make the timer lie.

### Assumptions

- Prices are whole rupees. A show can't be created in the past.
- A booking can be cancelled if the show is at least 2 hours away. Cancelled bookings stay in "My bookings" with status "Cancelled".
- A movie or show that has any booking (even a cancelled one) can't be deleted, to keep the history.
- If a user selects seats again, their previous unpaid hold for that show is released and replaced.

## 🗄️ Database design

```
users                 movies                 shows
-----                 ------                 -----
id PK                 id PK                  id PK
name                  title                  movie_id  FK -> movies.id
email  UNIQUE         description            starts_at   (UTC ISO)
password_hash         poster_url (nullable)  ends_at     (UTC ISO, start + duration)
role  customer|admin  language               price       (rupees)
created_at            duration_min > 0
                      rating  U|UA|A

holds                          bookings                         booking_seats
-----                          --------                         -------------
id PK                          id PK                            booking_id FK -> bookings.id
user_id FK -> users.id         user_id FK -> users.id           seat   ("C4")
show_id FK -> shows.id         show_id FK -> shows.id           PK (booking_id, seat)
expires_at                     amount
created_at                     status  confirmed|cancelled
                               created_at, cancelled_at

seat_reservations    <-- the table that makes double booking impossible
-----------------
show_id    FK -> shows.id
seat       "A1" .. "H10"
hold_id    FK -> holds.id      (set while held)
booking_id FK -> bookings.id   (set once paid)
expires_at                     (set only while held)
PRIMARY KEY (show_id, seat)
CHECK: held (booking_id NULL, expires_at set)  OR  booked (booking_id set, expires_at NULL)
```

One movie has many shows; one show has many bookings and up to 80 seat reservations; one user has many bookings and holds; one booking has many seats. Releasing a seat (hold expiry or cancellation) means deleting its `seat_reservations` row; the booking's own seat list stays in `booking_seats` for history.

## 🔌 API overview

| Method and path | Who | What |
| --- | --- | --- |
| `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | public / logged in | accounts |
| `GET /api/movies`, `GET /api/movies/:id` | public | movies, upcoming shows with seats left |
| `GET /api/shows/:id` | public (login adds "mine") | seat map |
| `POST /api/shows/:id/hold` | customer | hold 1 to 6 seats for 5 minutes |
| `DELETE /api/holds/:id` | customer | release my hold |
| `POST /api/holds/:id/pay` | customer | fake payment, body `{"outcome":"success"\|"failure"}` |
| `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings/:id/cancel` | customer (own only) | my bookings |
| `POST/PUT/DELETE /api/admin/movies...`, `POST/DELETE /api/admin/shows...` | admin | manage movies and shows |
| `GET /api/admin/shows`, `GET /api/admin/shows/:id` | admin | seats booked, % full, revenue, booking list |

## 🧪 Tests

`cd backend && npm test` runs 23 tests against an in-memory database, including:

- **Double booking:** two users race for one seat (exactly one wins); 20 users race for one seat (exactly one row in the database); the primary key itself rejects a duplicate row; a booked seat can't be held again.
- Hold expiry (the clock is injected, so the test "waits" 5 minutes instantly), payment success and failure, the 6-seat limit.
- Sign-up rules, hashed passwords, identical login errors, API calls rejected without login, customers blocked from admin APIs.
- Users can't read or cancel each other's bookings; booking order; overlapping shows; deleting shows with bookings; cancel rules; admin stats.

Honest note on the race tests: the SQLite driver runs one query at a time inside a single Node process, so they prove that the transaction and the primary key give the right result when requests arrive together, but they are not true parallel database sessions. I also fired two simultaneous HTTP requests at a running server (one got 201, the other 409), and the locking (`BEGIN IMMEDIATE`) also works across processes. With PostgreSQL I would use `SELECT ... FOR UPDATE` or rely on the same unique constraint.

## 📸 Screenshots

_Add screenshots here: home page, seat map with a hold countdown, booking confirmation, My bookings and the admin page._

## 🔮 Future Improvements

- PostgreSQL + Docker Compose setup
- Real online payment integration
- Server-Sent Events instead of polling for live seat updates
- Editing shows, multiple screens and email confirmations
- Movie reviews and ratings

## 👩‍💻 Author

**Rimjhim Verma**

- GitHub: [@Rimjhimv2](https://github.com/Rimjhimv2)

## 📄 License

This project was built for learning and as a hiring-task submission. Add a license if you want to distribute it under specific terms.
