import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Film } from 'lucide-react';
import { api } from '../api';
import type { MovieDetail, Show } from '../types';
import { CINEMA, dateKey, dateLabel, money, timeLabel } from '../format';
import { Loading, Poster } from '../ui';

export default function MoviePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMovie(null); setError('');
    api<MovieDetail>(`/movies/${id}`).then(setMovie).catch((e) => setError(e.message));
  }, [id]);

  // Group the upcoming shows by calendar date.
  const groups = useMemo(() => {
    const map = new Map<string, Show[]>();
    (movie?.shows ?? []).forEach((s) => { const k = dateKey(s.startsAt); map.set(k, [...(map.get(k) ?? []), s]); });
    return [...map.values()];
  }, [movie]);

  return (
    <main className="flow-page">
      <button className="back-link" onClick={() => nav('/')}><ArrowLeft size={16} /> All movies</button>
      {error && <div className="empty-state" style={{ marginTop: 30 }}><h3>{error}</h3></div>}
      {!movie && !error && <Loading />}
      {movie && <>
        <div className="flow-title">
          <div className="eyebrow muted">MOVIE DETAILS</div>
          <h1>{movie.title}</h1>
          <p>{movie.description}</p>
        </div>
        <div className="selected-movie">
          <Poster src={movie.poster} title={movie.title} />
          <div>
            <span className="eyebrow muted">{movie.certificate} · {movie.language.toUpperCase()}</span>
            <h2>{movie.genre}</h2>
            <p>{movie.duration} min{movie.rating != null ? ` · ★ ${movie.rating.toFixed(1)}` : ''}</p>
          </div>
        </div>

        <h3 className="subhead" style={{ marginTop: 34 }}>Upcoming shows <span>{movie.shows.length} SHOWS</span></h3>
        {!groups.length && <div className="empty-state"><Film size={30} /><h3>No upcoming shows</h3><p>There are no shows scheduled for this movie right now.</p></div>}
        {groups.map((list) => (
          <section key={list[0].startsAt}>
            <h3 className="subhead">{dateLabel(list[0].startsAt)} <span>{list.length} {list.length === 1 ? 'SHOW' : 'SHOWS'}</span></h3>
            <div className="show-list">
              {list.map((s) => (
                <article className="show-card" key={s.id}>
                  <div className="cinema-icon"><Film /></div>
                  <div className="cinema-detail">
                    <h3>{timeLabel(s.startsAt)}</h3>
                    <p>{CINEMA} · {movie.language}</p>
                    <span className={s.available ? 'good-availability' : 'bad-availability'}>
                      <i /> {s.available ? `${s.available} of 80 seats available` : 'Sold out'}
                    </span>
                  </div>
                  <div className="show-right">
                    <strong>{money(s.price)}<small> / ticket</small></strong>
                    <button className="outline-btn" disabled={!s.available} onClick={() => nav(`/shows/${s.id}/seats`)}>{s.available ? <>Select seats <span>→</span></> : 'Sold out'}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </>}
    </main>
  );
}
