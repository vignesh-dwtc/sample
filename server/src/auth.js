import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { ah, HttpError } from './util.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('JWT_SECRET must be set in production.');
  process.exit(1);
}

const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐧', '🐨', '🦖', '🐝', '🐳'];
const ADJ = ['Swift', 'Clever', 'Lucky', 'Brave', 'Witty', 'Cosmic', 'Sneaky', 'Mighty', 'Jolly', 'Turbo'];
const NOUN = ['Fox', 'Panda', 'Otter', 'Falcon', 'Tiger', 'Comet', 'Pixel', 'Ninja', 'Wizard', 'Rocket'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const signToken = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: '365d' });

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET).sub; } catch { return null; }
}

export const PUBLIC_USER_FIELDS =
  'id, username, email, is_guest, avatar, xp, coins, streak_current, streak_best, last_play_date, created_at';

export async function getUser(id) {
  const { rows } = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Express middleware: requires "Authorization: Bearer <jwt>"; sets req.user.
export const requireAuth = ah(async (req, _res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const id = token && verifyToken(token);
  const user = id && (await getUser(id));
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.user = user;
  next();
});

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export const authRouter = Router();

// Instant play: create a guest account, no form.
authRouter.post('/guest', ah(async (_req, res) => {
  for (let i = 0; i < 5; i++) {
    const username = `${pick(ADJ)}${pick(NOUN)}${Math.floor(1000 + Math.random() * 9000)}`;
    const { rows } = await query(
      `INSERT INTO users (username, avatar) VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING RETURNING ${PUBLIC_USER_FIELDS}`,
      [username, pick(AVATARS)]
    );
    if (rows[0]) return res.json({ token: signToken(rows[0]), user: rows[0] });
  }
  throw new HttpError(500, 'Could not create guest');
}));

// Upgrade the current guest to a full account (keeps all progress).
authRouter.post('/claim', requireAuth, ah(async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!req.user.is_guest) throw new HttpError(400, 'Account already registered');
  if (!USERNAME_RE.test(username || '')) throw new HttpError(400, 'Username must be 3-20 letters, numbers or _');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Valid email required');
  if (!password || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `UPDATE users SET username=$1, email=lower($2), password_hash=$3, is_guest=false
       WHERE id=$4 RETURNING ${PUBLIC_USER_FIELDS}`,
      [username, email, hash, req.user.id]
    );
    res.json({ token: signToken(rows[0]), user: rows[0] });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Username or email already taken');
    throw e;
  }
}));

authRouter.post('/login', ah(async (req, res) => {
  const { login, password } = req.body || {};
  const { rows } = await query(
    `SELECT id, password_hash FROM users WHERE (lower(username)=lower($1) OR email=lower($1)) AND NOT is_guest`,
    [login || '']
  );
  if (!rows[0] || !(await bcrypt.compare(password || '', rows[0].password_hash))) {
    throw new HttpError(401, 'Invalid username/email or password');
  }
  const user = await getUser(rows[0].id);
  res.json({ token: signToken(user), user });
}));

authRouter.patch('/me', requireAuth, ah(async (req, res) => {
  const { avatar } = req.body || {};
  if (avatar && !AVATARS.includes(avatar)) throw new HttpError(400, 'Unknown avatar');
  const { rows } = await query(
    `UPDATE users SET avatar=COALESCE($1, avatar) WHERE id=$2 RETURNING ${PUBLIC_USER_FIELDS}`,
    [avatar || null, req.user.id]
  );
  res.json({ user: rows[0] });
}));

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user, avatars: AVATARS }));
