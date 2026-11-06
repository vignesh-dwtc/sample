import pg from 'pg';
import { readFile } from 'node:fs/promises';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Point it at your Neon database (see .env.example).');
  process.exit(1);
}

// DATE columns come back as 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone drift).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX || 10) });

export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
