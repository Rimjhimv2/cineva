import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const FILE = fileURLToPath(new URL('../db/movies.json', import.meta.url));
const FORCE_ALL = process.argv.includes('--all');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'cineva-poster-fix/1.0 (student project)' } });
    } catch { r = null; }
    finally { clearTimeout(timer); }
    if (r && r.status !== 429 && r.status !== 503) return r;
    await sleep(2000 * (attempt + 1));
  }
  return r;
}
async function imageWorks(url) {
  if (!url) return false;
  const r = await get(url);
  return !!r && r.ok && (r.headers.get('content-type') || '').startsWith('image/');
}
async function fromWikipedia(title) {
  const want = norm(title);
  for (const q of [`${title} (film)`, `${title} film`, title]) {
    const r = await get(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&formatversion=2&origin=*`);
    if (!r || !r.ok) continue;
    const pages = ((await r.json()).query?.pages || []).sort((a, b) => a.index - b.index)
      .filter((p) => p.thumbnail?.source && norm(p.title).startsWith(want) && !/soundtrack|album|song|series|score|franchise|characters/i.test(p.title));
    const best = pages.find((p) => /film/i.test(p.title)) || pages[0];
    if (best) return best.thumbnail.source;
  }
  return null;
}

const movies = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixed = 0, failed = [];
for (const m of movies) {
  if (!FORCE_ALL && await imageWorks(m.poster)) { console.log(`ok      ${m.title}`); continue; }
  const url = await fromWikipedia(m.title);
  if (url && await imageWorks(url)) { m.poster = url; fixed++; console.log(`FIXED   ${m.title}`); }
  else { failed.push(m.title); console.log(`MISSING ${m.title}  (wiki url: ${url || 'none'})`); }
  await sleep(500);
}
fs.writeFileSync(FILE, JSON.stringify(movies, null, 2) + '\n');

if (process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const m of movies) await client.query("UPDATE movies SET poster = $2 WHERE title = $1 AND $2 <> ''", [m.title, m.poster]);
  await client.end();
  console.log('Database updated.');
}
console.log(`\nFixed ${fixed}, still missing ${failed.length}${failed.length ? ': ' + failed.join(', ') : ''}.`);