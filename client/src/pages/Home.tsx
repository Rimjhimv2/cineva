import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Search, X, Film, Popcorn, Clapperboard } from 'lucide-react';
import { api } from '../api';
import type { Movie } from '../types';
import { Poster } from '../ui';

const GENRES = ['All', 'Sci-Fi', 'Action', 'Drama', 'Animation', 'Comedy', 'Adventure', 'Crime', 'Romance'];

export default function Home() {
  const nav = useNavigate();
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All');

  useEffect(() => {
    api<Movie[]>('/movies').then(setMovies).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (movies ?? []).filter((m) => {
      const hay = `${m.title} ${m.genre} ${m.language} ${m.description}`.toLowerCase();
      return words.every((w) => hay.includes(w)) && (genre === 'All' || m.genre.toLowerCase().includes(genre.toLowerCase()));
    });
  }, [movies, query, genre]);

  const hero = (movies ?? []).filter((m) => m.poster).slice(0, 3);
  const open = (m: Movie) => { nav(`/movies/${m.id}`); window.scrollTo({ top: 0 }); };

  return (
    <>
      <section className="hero">
        <div className="hero-backdrop" />
        <div className="hero-content">
          <div className="eyebrow"><span className="live-dot" /> YOUR NEXT BIG SCREEN MOMENT</div>
          <h1>Stories worth<br /><em>stepping out for.</em></h1>
          <p>Find your film. Pick your seats. Make a night of it.</p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => document.getElementById('movies')?.scrollIntoView({ behavior: 'smooth' })}>Explore movies <span>↗</span></button>
            <div className="hero-note"><Star size={15} fill="currentColor" /> Curated for movie lovers</div>
          </div>
        </div>
        <div className="hero-art">
          {hero[0] && <div className="hero-poster poster-one"><img src={hero[0].poster} alt="" /><span>NOW SHOWING</span></div>}
          {hero[2] && <div className="hero-poster poster-two"><img src={hero[2].poster} alt="" /></div>}
          {hero[1] && <div className="hero-poster poster-three"><img src={hero[1].poster} alt="" /></div>}
          <div className="orbit orbit-a" /><div className="orbit orbit-b" />
          <div className="hero-sticker"><Clapperboard size={18} /><span>Good films.<br />Great plans.</span></div>
        </div>
        <div className="hero-bottom"><span>SCROLL TO DISCOVER</span><span className="scroll-line" /><span>01 — {String(movies?.length ?? 0).padStart(2, '0')}</span></div>
      </section>

      <main className="main-content" id="movies">
        <div className="section-head">
          <div>
            <div className="eyebrow muted">THE CINEMA EDITION · ONE SCREEN</div>
            <h2>Now <em>showing</em></h2>
            <p className="section-sub">Big stories. Bigger feelings. Find your next favourite.</p>
          </div>
          <div className="movie-count"><strong>{String(filtered.length).padStart(2, '0')}</strong><span>FILMS TO EXPLORE</span></div>
        </div>
        <div className="filter-row">
          <div className="search-box"><Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies, genres, languages..." />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
          </div>
          <div className="genre-filters">{GENRES.map((g) => <button key={g} className={genre === g ? 'selected' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div>
        </div>

        {error && <div className="empty-state"><Film size={30} /><h3>Could not load movies</h3><p>{error}</p></div>}
        {!movies && !error && <div className="empty-state"><p>Loading movies…</p></div>}

        <div className="movie-grid">
          {filtered.map((m, i) => (
            <article className="movie-card" key={m.id} onClick={() => open(m)}>
              <div className="poster-wrap">
                <Poster src={m.poster} title={m.title} />
                <span className="poster-index">{String(i + 1).padStart(2, '0')}</span>
                {m.rating != null && <span className="rating"><Star size={12} fill="currentColor" />{m.rating.toFixed(1)}</span>}
                <button className="poster-cta" onClick={(e) => { e.stopPropagation(); open(m); }}>View shows <span>↗</span></button>
              </div>
              <div className="movie-info">
                <div className="movie-meta">{m.certificate} <span>·</span> {m.duration} min <span>·</span> {m.language}</div>
                <h3>{m.title}</h3>
                <p>{m.genre}</p>
              </div>
            </article>
          ))}
        </div>
        {movies && filtered.length === 0 && (
          <div className="empty-state"><Film size={30} /><h3>No films found</h3><p>Try a different title, genre or language.</p>
            <button className="outline-btn" onClick={() => { setQuery(''); setGenre('All'); }}>Clear filters</button></div>
        )}
        <section className="perks">
          <div className="perk-icon"><Popcorn size={24} /></div>
          <div><span>THE LITTLE EXTRAS</span><h3>Make an evening of it.</h3><p>Easy booking, comfy seats, and the magic of the big screen.</p></div>
          <div className="perk-right">YOUR SEAT IS WAITING <span>✳</span></div>
        </section>
      </main>
    </>
  );
}
