import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ChevronDown, MapPin, Menu, Ticket } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { RequireAuth } from './ui';
import Home from './pages/Home';
import MoviePage from './pages/MoviePage';
import SeatPage from './pages/SeatPage';
import CheckoutPage from './pages/CheckoutPage';
import ConfirmedPage from './pages/ConfirmedPage';
import BookingsPage from './pages/BookingsPage';
import AdminPage from './admin/AdminPage';
import AdminShowPage from './admin/AdminShowPage';

function Header() {
  const { user, logout, openAuth } = useAuth();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const go = (fn: () => void) => () => { fn(); setMenu(false); };
  return (
    <header className="topbar"><div className="nav-inner">
      <Link to="/" className="brand"><span className="brand-icon"><Ticket size={20} /></span>cine<span>va</span><i>.</i></Link>
      <nav className={menu ? 'nav-links open' : 'nav-links'}>
        <NavLink to="/" end onClick={() => setMenu(false)}>Movies</NavLink>
        <NavLink to="/bookings" onClick={() => setMenu(false)}>My bookings</NavLink>
        {user?.role === 'admin' && <NavLink to="/admin" onClick={() => setMenu(false)}>Admin</NavLink>}
        {user
          ? <button onClick={go(() => { logout(); nav('/'); })}>Sign out · {user.name.split(' ')[0]}</button>
          : <button onClick={go(() => openAuth('signin'))}>Sign in / Sign up</button>}
      </nav>
      <div className="location"><MapPin size={15} /><span>Noida</span><ChevronDown size={14} /></div>
      <button className="mobile-toggle" onClick={() => setMenu(!menu)} aria-label="Menu"><Menu /></button>
    </div></header>
  );
}

function Footer() {
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return (
    <footer className="site-footer">
      <div className="footer-topline"><span className="footer-topline-mark">✳</span><span>YOUR NEXT MOVIE NIGHT STARTS HERE</span><span className="footer-topline-rule" /><span className="footer-topline-city">MADE FOR MOVIE LOVERS</span></div>
      <div className="footer-main">
        <div className="footer-about">
          <Link to="/" className="footer-brand" onClick={top}><span className="footer-brand-icon"><Ticket size={20} /></span>cine<span>va</span><i>.</i></Link>
          <p>Discover great films, find your perfect showtime, and turn an ordinary evening into a cinema memory.</p>
        </div>
        <div className="footer-column"><h3>EXPLORE</h3>
          <button onClick={() => { nav('/'); setTimeout(() => document.getElementById('movies')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>Now showing</button>
          <button onClick={() => nav('/bookings')}>My bookings</button></div>
        <div className="footer-column"><h3>YOUR CINEVA</h3>
          {!user && <><button onClick={() => openAuth('signup')}>Create an account</button><button onClick={() => openAuth('signin')}>Sign in</button></>}
          <button onClick={top}>Back to top ↑</button></div>
        <div className="footer-note"><span className="footer-note-icon">✳</span><h3>Every night can be<br /><em>movie night.</em></h3><p>Your next big-screen moment is just a few clicks away.</p>
          <button onClick={() => { nav('/'); top(); }}>Find your film <span>↗</span></button></div>
      </div>
      <div className="footer-bottom"><span>© 2026 CINEVA. ALL RIGHTS RESERVED.</span><span><i></i> A little more magic, one ticket at a time.</span><span>DEMO BOOKING EXPERIENCE</span></div>
    </footer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies/:id" element={<MoviePage />} />
          <Route path="/shows/:id/seats" element={<RequireAuth><SeatPage /></RequireAuth>} />
          <Route path="/shows/:id/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="/bookings" element={<RequireAuth><BookingsPage /></RequireAuth>} />
          <Route path="/bookings/:id/confirmed" element={<RequireAuth><ConfirmedPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
          <Route path="/admin/shows/:id" element={<RequireAuth admin><AdminShowPage /></RequireAuth>} />
          <Route path="*" element={<main className="flow-page"><div className="empty-state"><h3>Page not found</h3><Link className="primary-btn" to="/">Go home</Link></div></main>} />
        </Routes>
        <Footer />
      </div>
    </AuthProvider>
  );
}
