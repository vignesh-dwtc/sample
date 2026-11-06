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

// Columns PlayNest relies on. If a table with the same name already exists from another app
// (e.g. a shared Neon database), CREATE TABLE IF NOT EXISTS silently keeps the foreign table
// and every request fails later. Detect that at startup and fail loudly instead.
const REQUIRED_COLUMNS = {
  users: ['id', 'username', 'email', 'password_hash', 'is_guest', 'avatar', 'xp', 'coins',
    'streak_current', 'streak_best', 'last_play_date', 'created_at'],
  game_results: ['id', 'user_id', 'game', 'play_date', 'score', 'won', 'data', 'created_at'],
  daily_progress: ['user_id', 'game', 'play_date', 'state', 'finished', 'updated_at'],
  achievements: ['user_id', 'code', 'unlocked_at'],
  detective_cases: ['id', 'user_id', 'source', 'secret', 'transcripts', 'questions_used', 'status', 'created_at'],
};

export async function findSchemaConflicts(db = pool) {
  const { rows } = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [Object.keys(REQUIRED_COLUMNS)]
  );
  const conflicts = [];
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    const have = new Set(rows.filter((r) => r.table_name === table).map((r) => r.column_name));
    if (!have.size) continue; // table doesn't exist yet — schema.sql will create it
    const missing = cols.filter((c) => !have.has(c));
    if (missing.length) conflicts.push({ table, missing });
  }
  return conflicts;
}

export async function migrate() {
  const conflicts = await findSchemaConflicts();
  if (conflicts.length) {
    const detail = conflicts.map((c) => `"${c.table}" (missing: ${c.missing.join(', ')})`).join('; ');
    throw new Error(
      `This database already contains tables from another app: ${detail}. ` +
      'PlayNest needs its own database. In Neon, create a new database (e.g. "playnest") ' +
      'and point DATABASE_URL at it.'
    );
  }
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
