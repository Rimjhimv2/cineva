import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();
const app = express();
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  process.env.CLIENT_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  }
}));
app.use(express.json());
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined }) : null;
const demoMovies = [
 {id:1,title:'Dune: Part Two',genre:'Sci-Fi / Adventure',duration:166,rating:'8.6',language:'English',certificate:'UA',description:'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',poster:'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg'},
 {id:2,title:'Interstellar',genre:'Sci-Fi / Drama',duration:169,rating:'8.7',language:'English',certificate:'UA',description:'A team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.',poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'},
 {id:3,title:'The Dark Knight',genre:'Action / Crime',duration:152,rating:'9.0',language:'English',certificate:'UA',description:'Batman faces his greatest psychological and physical test when the Joker unleashes chaos on Gotham.',poster:'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg'},
 {id:4,title:'Spider-Man: Across the Spider-Verse',genre:'Animation / Action',duration:140,rating:'8.7',language:'English',certificate:'U/A',description:'Miles Morales catapults across the multiverse, where he encounters a team charged with protecting its existence.',poster:'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj에.jpg'},
 {id:5,title:'Oppenheimer',genre:'Drama / History',duration:180,rating:'8.3',language:'English',certificate:'UA',description:'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.',poster:'https://image.tmdb.org/t/p/w500/ptpr0kGAckfQkJeJIt8st5dglvd.jpg'},
 {id:6,title:'Everything Everywhere All at Once',genre:'Action / Comedy',duration:139,rating:'7.8',language:'English',certificate:'A',description:'An exhausted laundromat owner discovers she must connect with parallel-universe versions of herself.',poster:'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg'}
];
const demoShows = [
 {id:101,movieId:1,cinema:'PVR: Logix City Centre',area:'Noida',date:'2026-10-19',time:'10:30 AM',price:220,format:'IMAX'},
 {id:102,movieId:1,cinema:'INOX: Gardens Galleria',area:'Noida',date:'2026-10-19',time:'1:45 PM',price:180,format:'2D'},
 {id:103,movieId:1,cinema:'PVR: Logix City Centre',area:'Noida',date:'2026-10-19',time:'6:30 PM',price:250,format:'IMAX'},
 {id:201,movieId:2,cinema:'INOX: Gardens Galleria',area:'Noida',date:'2026-10-19',time:'11:15 AM',price:200,format:'2D'},
 {id:301,movieId:3,cinema:'PVR: Logix City Centre',area:'Noida',date:'2026-10-19',time:'4:00 PM',price:190,format:'2D'},
 {id:401,movieId:4,cinema:'Cinepolis: DLF Mall',area:'Noida',date:'2026-10-19',time:'2:20 PM',price:210,format:'3D'},
 {id:501,movieId:5,cinema:'PVR: Logix City Centre',area:'Noida',date:'2026-10-19',time:'7:00 PM',price:240,format:'2D'},
 {id:601,movieId:6,cinema:'INOX: Gardens Galleria',area:'Noida',date:'2026-10-19',time:'5:15 PM',price:170,format:'2D'}
];
app.get('/api/health', (_req,res) => res.json({ok:true, database: pool ? 'configured' : 'demo-mode'}));
app.get('/api/movies', async (_req,res,next) => {
 try { if(pool) { const r=await pool.query('SELECT id,title,genre,duration,rating,language,certificate,description,poster FROM movies ORDER BY id'); if(r.rows.length) return res.json(r.rows); } res.json(demoMovies); } catch(e){next(e)}
});
app.get('/api/movies/:id', (req,res) => { const m=demoMovies.find(x=>x.id===Number(req.params.id)); m?res.json(m):res.status(404).json({error:'Movie not found'}); });
app.get('/api/shows', async (req,res,next) => {
 try { const movieId=Number(req.query.movieId); if(pool){ const r=await pool.query('SELECT id,movie_id AS "movieId",cinema,area,show_date::text AS date,show_time AS time,price,format FROM shows WHERE movie_id=$1 ORDER BY show_time',[movieId]); if(r.rows.length)return res.json(r.rows); } res.json(demoShows.filter(s=>s.movieId===movieId)); }catch(e){next(e)}
});
app.post('/api/auth/register', async(req,res,next)=>{try{
 const {name,email,password}=req.body; if(!name||!email||!password||password.length<8)return res.status(400).json({error:'Name, email and password (8+ characters) are required.'});
 if(!pool||!process.env.JWT_SECRET)return res.status(503).json({error:'Configure DATABASE_URL and JWT_SECRET in server/.env to enable accounts.'});
 const hash=await bcrypt.hash(password,12); const r=await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[name,email.toLowerCase(),hash]);
 res.status(201).json({user:r.rows[0],token:jwt.sign({id:r.rows[0].id},process.env.JWT_SECRET,{expiresIn:'7d'})});
 }catch(e){ if(e.code==='23505')return res.status(409).json({error:'Email already registered.'});next(e)}});
app.post('/api/auth/login', async(req,res,next)=>{try{
 const {email,password}=req.body; if(!pool||!process.env.JWT_SECRET)return res.status(503).json({error:'Configure DATABASE_URL and JWT_SECRET in server/.env to enable accounts.'});
 const r=await pool.query('SELECT id,name,email,password_hash FROM users WHERE email=$1',[String(email||'').toLowerCase()]);
 if(!r.rows[0]||!await bcrypt.compare(password||'',r.rows[0].password_hash))return res.status(401).json({error:'Invalid email or password.'});
 const {password_hash,...user}=r.rows[0];res.json({user,token:jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:'7d'})});
 }catch(e){next(e)}});
const auth=(req,res,next)=>{try{if(!process.env.JWT_SECRET)return res.status(503).json({error:'Server authentication is not configured.'});const token=(req.headers.authorization||'').replace(/^Bearer /,'');req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({error:'Please sign in to your Cineva account.'})}};
app.post('/api/bookings', auth, async(req,res,next)=>{try{
 const {showId,seats}=req.body; if(!Array.isArray(seats)||!seats.length||seats.length>8)return res.status(400).json({error:'Choose between 1 and 8 seats.'});
 if(!pool)return res.status(503).json({error:'Account and booking features require PostgreSQL. Configure DATABASE_URL first.'});
 const client=await pool.connect();try{await client.query('BEGIN');
 const s=await client.query('SELECT id,price FROM shows WHERE id=$1 FOR UPDATE',[showId]);if(!s.rowCount)throw Object.assign(new Error('Show not found in the database. Seed the shows table and try again.'),{status:404});
 const conflicts=await client.query("SELECT seat_number FROM booking_seats bs JOIN bookings b ON b.id=bs.booking_id WHERE b.show_id=$1 AND b.status='CONFIRMED' AND bs.seat_number=ANY($2::text[])",[showId,seats]);
 if(conflicts.rowCount)throw Object.assign(new Error('Some seats have just been booked. Please choose again.'),{status:409});
 const total=Number(s.rows[0].price)*seats.length+25;const b=await client.query("INSERT INTO bookings(user_id,show_id,total_amount,status) VALUES($1,$2,$3,'CONFIRMED') RETURNING id,show_id AS \"showId\",total_amount AS \"totalAmount\",status,created_at",[req.user.id,showId,total]);
 for(const seat of seats)await client.query('INSERT INTO booking_seats(booking_id,seat_number) VALUES($1,$2)',[b.rows[0].id,seat]);
 await client.query('COMMIT');res.status(201).json({...b.rows[0],seats});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){next(e)}});
app.get('/api/bookings/me',auth,async(req,res,next)=>{try{const r=await pool.query("SELECT b.id,b.total_amount AS \"totalAmount\",b.status,b.created_at,m.title,s.cinema,s.show_date,s.show_time,ARRAY(SELECT seat_number FROM booking_seats WHERE booking_id=b.id) AS seats FROM bookings b JOIN shows s ON s.id=b.show_id JOIN movies m ON m.id=s.movie_id WHERE b.user_id=$1 ORDER BY b.created_at DESC",[req.user.id]);res.json(r.rows)}catch(e){next(e)}});
app.use((err,_req,res,_next)=>{console.error(err);res.status(err.status||500).json({error:err.message||'Unexpected server error.'})});
const port=process.env.PORT||4000;app.listen(port,()=>console.log(`Yozigo API listening on ${port}`));
