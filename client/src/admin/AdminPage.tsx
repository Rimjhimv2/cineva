import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AdminShow, Movie } from '../types';
import { dateLabel, money, timeLabel } from '../format';
import { Loading } from '../ui';

type Tab = 'shows' | 'movies';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('shows');
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const loadMovies = useCallback(() => api<Movie[]>('/movies').then(setMovies), []);
  useEffect(() => { loadMovies(); }, [loadMovies]);

  return (
    <main className="flow-page admin-page">
      <div className="flow-title">
        <div className="eyebrow muted">CINEMA STAFF</div>
        <h1>Admin <em>panel.</em></h1>
        <p>Add movies, schedule shows and see how full each show is.</p>
      </div>
      <div className="genre-filters admin-tabs">
        <button className={tab === 'shows' ? 'selected' : ''} onClick={() => setTab('shows')}>Shows & bookings</button>
        <button className={tab === 'movies' ? 'selected' : ''} onClick={() => setTab('movies')}>Movies</button>
      </div>
      {!movies ? <Loading /> : tab === 'shows' ? <ShowsTab movies={movies} /> : <MoviesTab movies={movies} reload={loadMovies} />}
    </main>
  );
}

function ShowsTab({ movies }: { movies: Movie[] }) {
  const nav = useNavigate();
  const [shows, setShows] = useState<AdminShow[] | null>(null);
  const [f, setF] = useState({ movieId: '', date: '', time: '', price: '200' });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const load = useCallback(() => api<AdminShow[]>('/admin/shows').then(setShows), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setMsg(null);
    if (!f.movieId || !f.date || !f.time) return setMsg({ text: 'Choose a movie, date and start time.', ok: false });
    try {
      await api('/admin/shows', { method: 'POST', body: { movieId: Number(f.movieId), startsAt: new Date(`${f.date}T${f.time}`).toISOString(), price: Number(f.price) } });
      setMsg({ text: 'Show added.', ok: true });
      await load();
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };

  const remove = async (s: AdminShow) => {
    if (!window.confirm(`Delete the ${timeLabel(s.startsAt)} show of ${s.title}?`)) return;
    try { await api(`/admin/shows/${s.id}`, { method: 'DELETE' }); setMsg({ text: 'Show deleted.', ok: true }); await load(); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };

  const upcoming = (shows ?? []).filter((s) => !s.started);
  const past = (shows ?? []).filter((s) => s.started);

  const table = (rows: AdminShow[]) => (
    <div className="table-scroll"><table className="admin-table">
      <thead><tr><th>Movie</th><th>Date & time</th><th>Price</th><th>Booked</th><th>Full</th><th>Collected</th><th /></tr></thead>
      <tbody>{rows.map((s) => (
        <tr key={s.id}>
          <td>{s.title}</td><td>{dateLabel(s.startsAt)}, {timeLabel(s.startsAt)}</td><td>{money(s.price)}</td>
          <td>{s.booked} / {s.totalSeats}</td>
          <td><div className="meter"><i style={{ width: `${s.percentFull}%` }} /></div>{s.percentFull}%</td>
          <td>{money(s.revenue)}</td>
          <td className="row-actions">
            <button className="outline-btn" onClick={() => nav(`/admin/shows/${s.id}`)}>Open</button>
            <button className="outline-btn danger" onClick={() => remove(s)}>Delete</button>
          </td>
        </tr>))}
      </tbody>
    </table></div>
  );

  return (
    <>
      <section className="admin-card">
        <h2>Add a show</h2>
        <div className="admin-form">
          <label>Movie<select value={f.movieId} onChange={(e) => setF({ ...f, movieId: e.target.value })}>
            <option value="">Select a movie…</option>{movies.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.duration} min)</option>)}</select></label>
          <label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label>Start time<input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          <label>Ticket price (₹)<input type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
        </div>
        <p className="hint">One screen: a show cannot start before the previous show (start time + movie length) has ended.</p>
        {msg && <div className={msg.ok ? 'ok-notice' : 'form-notice'} role="alert">{msg.text}</div>}
        <button className="primary-btn" onClick={add}>Add show <span>+</span></button>
      </section>

      <h3 className="subhead">Upcoming shows <span>{upcoming.length}</span></h3>
      {!shows ? <Loading /> : upcoming.length ? table(upcoming) : <div className="empty-state"><p>No upcoming shows.</p></div>}
      {past.length > 0 && <><h3 className="subhead">Past shows <span>{past.length}</span></h3>{table(past)}</>}
    </>
  );
}

const EMPTY = { title: '', genre: '', duration: '120', language: 'English', certificate: 'UA', rating: '', poster: '', description: '' };

function MoviesTab({ movies, reload }: { movies: Movie[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setMsg(null);
    try {
      const body = { ...f, duration: Number(f.duration), rating: f.rating === '' ? null : Number(f.rating) };
      if (editing) await api(`/admin/movies/${editing}`, { method: 'PUT', body });
      else await api('/admin/movies', { method: 'POST', body });
      setMsg({ text: editing ? 'Movie updated.' : 'Movie added.', ok: true });
      setEditing(null); setF(EMPTY); await reload();
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };
  const edit = (m: Movie) => {
    setEditing(m.id); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' });
    setF({ title: m.title, genre: m.genre, duration: String(m.duration), language: m.language, certificate: m.certificate, rating: m.rating == null ? '' : String(m.rating), poster: m.poster, description: m.description });
  };
  const remove = async (m: Movie) => {
    if (!window.confirm(`Delete "${m.title}" and its shows?`)) return;
    try { await api(`/admin/movies/${m.id}`, { method: 'DELETE' }); setMsg({ text: 'Movie deleted.', ok: true }); await reload(); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };

  return (
    <>
      <section className="admin-card">
        <h2>{editing ? 'Edit movie' : 'Add a movie'}</h2>
        <div className="admin-form">
          <label>Title<input value={f.title} onChange={set('title')} /></label>
          <label>Genre<input value={f.genre} onChange={set('genre')} placeholder="Drama / Romance" /></label>
          <label>Duration (min)<input type="number" min="1" value={f.duration} onChange={set('duration')} /></label>
          <label>Language<input value={f.language} onChange={set('language')} /></label>
          <label>Rating<select value={f.certificate} onChange={set('certificate')}><option>U</option><option>UA</option><option>A</option></select></label>
          <label>Audience score (0-10, optional)<input type="number" step="0.1" min="0" max="10" value={f.rating} onChange={set('rating')} /></label>
          <label className="wide">Poster image URL (optional)<input value={f.poster} onChange={set('poster')} placeholder="https://…" /></label>
          <label className="wide">Description<textarea rows={3} value={f.description} onChange={set('description')} /></label>
        </div>
        {msg && <div className={msg.ok ? 'ok-notice' : 'form-notice'} role="alert">{msg.text}</div>}
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="primary-btn" onClick={save}>{editing ? 'Save changes' : 'Add movie'} <span>→</span></button>
          {editing && <button className="outline-btn" onClick={() => { setEditing(null); setF(EMPTY); setMsg(null); }}>Cancel</button>}
        </div>
      </section>
      <h3 className="subhead">All movies <span>{movies.length}</span></h3>
      <div className="table-scroll"><table className="admin-table">
        <thead><tr><th>Title</th><th>Genre</th><th>Language</th><th>Rating</th><th>Min</th><th /></tr></thead>
        <tbody>{movies.map((m) => (
          <tr key={m.id}><td>{m.title}</td><td>{m.genre}</td><td>{m.language}</td><td>{m.certificate}</td><td>{m.duration}</td>
            <td className="row-actions"><button className="outline-btn" onClick={() => edit(m)}>Edit</button><button className="outline-btn danger" onClick={() => remove(m)}>Delete</button></td></tr>))}
        </tbody>
      </table></div>
    </>
  );
}
