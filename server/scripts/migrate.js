// Applies db/schema.sql (safe to re-run). Usage: npm run db:schema
import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function applySchema(client) {
  const sql = fs.readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
  await client.query(sql);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await applySchema(client);
  await client.end();
  console.log('Schema applied.');
}
