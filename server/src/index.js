import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { authRouter } from './auth.js';
import { profileRouter, leaderboardRouter } from './routes/profile.js';
import { dailyRouter } from './routes/daily.js';
import { detectiveRouter } from './routes/detective.js';
import { attachParty } from './party/index.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'production') app.use(cors());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/daily', dailyRouter);
app.use('/api/detective', detectiveRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app (single Render service hosts API + WebSocket + frontend).
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, file) {
        // Hashed build assets never change; the shell, worker and manifest must revalidate.
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  // A missing asset or file must 404, not fall through to index.html (that would be
  // served as JS/CSS with a text/html type and could be cached by the service worker).
  app.get(/^\/assets\/|\.[a-z0-9]+$/i, (_req, res) => res.status(404).type('text').send('Not found'));
  app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: dist });
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

const server = http.createServer(app);
attachParty(server);

const port = Number(process.env.PORT || 3001);
await migrate();
server.listen(port, () => console.log(`PlayNest server on http://localhost:${port}`));
