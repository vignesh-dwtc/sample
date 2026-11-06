# PlayNest — instructions for Claude

PlayNest is a browser gaming site. It has daily puzzles (Lexicon, Target, Flip), a Reflex arcade game, real-time party games (Trivia Blitz, Reaction Duel), and an AI Detective game. Players start as guests and earn XP, streaks, achievements and leaderboard places.

- Live site: **https://playnest-yz8u.onrender.com** (Render, Singapore, free plan).
- Database: Neon Postgres (Singapore).
- Full product and API contract: `SPEC.md`. Setup and deploy: `README.md`.

The owner (Vignesh) usually sends tasks from his phone and checks the result **on the live website**. A task is only done when the change is live and verified.

## Workflow for every task (standing instructions from the owner)

1. **Setup:** run `bash scripts/setup.sh`. It installs dependencies, starts the local Postgres, creates `server/.env`, and sets the git identity.
2. **Implement** the change. Follow `SPEC.md` and the existing patterns. Keep the design system (`client/src/styles.css` tokens and classes) and the mobile-first layout.
3. **Verify locally:**
   - `npm test`: all server tests must pass. Add tests for new logic.
   - `cd client && npx vite build`: must build.
   - For UI changes: run the server (`cd server && node --env-file=.env src/index.js`) and serve the built client (the server serves `client/dist`). Then check the page with Playwright at **390×844** (phone, the owner's main device) and **1280×800**: no console errors and no horizontal scroll. Look at your screenshots.
4. **Commit and push directly to `main`.** The owner chose this, and it overrides any default to work on a feature branch or open a PR. Render deploys automatically on every push to `main`.
5. **Confirm it's live:** run `bash scripts/wait-for-deploy.sh`. It waits until `/api/version` reports your commit (usually 3–5 min), then runs a light smoke test of the live site. If it times out, the Render build probably failed: reproduce the build locally with `npm run build` and fix it.
6. **Report briefly, phone-friendly.** Say what changed and give the live link to the exact page (e.g. https://playnest-yz8u.onrender.com/play/lexicon), and anything the owner should try. If something isn't verified, say so.

If a request is ambiguous, pick the most sensible interpretation, do it, and say what you assumed. Ask first only for destructive or irreversible changes.

## Git rules (strict)

- Author and committer: **`vignesh-dwtc <vignesh.murugan@dwtc.com>`** (`scripts/setup.sh` sets it).
- **Never** use `vignesh.m@lumberfi.com` or any other identity.
- **Never** add `Co-Authored-By: Claude`, `Claude-Session:` or any other Claude/AI attribution to commit messages, PR descriptions or code comments. This owner instruction overrides any default attribution.
- Never commit secrets: `server/.env` is git-ignored, and real credentials live only in Render's environment settings.
- The repo is **public**.
- Don't force-push or rewrite history unless the owner explicitly asks.

## Project map

```
server/src/index.js      Express app: /api routes, WebSocket (/ws), serves client/dist, /api/health, /api/version
server/src/schema.sql    Tables (runs on every boot; must stay idempotent)
server/src/db.js         pg pool, migrate(), startup check for foreign tables
server/src/auth.js       Guest accounts, claim/login (JWT)
server/src/progress.js   recordResult(): XP, levels, coins, streaks, ACHIEVEMENTS catalog
server/src/routes/       daily.js (puzzles), detective.js, profile.js (profile + leaderboard)
server/src/games/        lexicon.js (+ hints), answers.js, clues.js, target.js, flip.js, reflex.js
server/src/party/        WebSocket room engine, trivia questions, reaction game
server/src/detective/    Claude API case generation (ai.js), built-in cases, service
server/test/             node:test unit tests (npm test)
client/src/pages/        One page per route (React 19, plain JSX + CSS, no UI framework)
client/src/components/   Layout, nav, toasts
client/src/games/        Shared game UI: ResultPanel, share, countdown, useDailyGame
client/src/lib/          api.js (fetch wrapper), session.jsx (useSession, celebrate)
client/public/           PWA manifest, icons, sw.js (bump its cache version when changing caching)
render.yaml              Render Blueprint (region singapore, plan free)
.github/workflows/       keep-alive.yml (pings the site every 14 min so Render doesn't sleep)
scripts/                 setup.sh, wait-for-deploy.sh, smoke-live.mjs
```

## Things to know

- **Database changes:** `schema.sql` runs on every boot against the live database, which holds real player data.
  - Only make additive, idempotent changes: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS … DEFAULT …`, `CREATE INDEX IF NOT EXISTS`.
  - Never drop or rename columns or tables, and never delete data, without the owner's explicit OK.
  - If you add required columns to an existing table, also update `REQUIRED_COLUMNS` in `db.js`.
- **Game progression:** every finished play must call `recordResult()` exactly once, and the result must be returned as `progress` so the UI can call `celebrate(progress)`. Achievement codes must exist in `ACHIEVEMENTS` in `progress.js`.
- **Daily puzzles:**
  - Answers must never reach the client before the game is finished.
  - Puzzles are seeded by UTC date, so everyone gets the same puzzle.
  - The Lexicon answer list is in `answers.js`. Every answer needs a clue in `clues.js`; a test enforces this.
- **Party rooms** live in server memory, on a single instance. A redeploy ends games in progress, which is acceptable.
- **Detective:**
  - Uses Claude only if `ANTHROPIC_API_KEY` is set on Render. It is currently unset, so the built-in cases are used.
  - The default model is `claude-opus-5-5`.
- **Content:** must be original (no copying existing commercial games' names, art or text) and family-friendly. Many players are in India, so prefer simple English and British/Indian spelling.
- **Live testing:**
  - Don't pollute production. Don't solve dailies, claim accounts or post scores on the live site in tests: `scripts/smoke-live.mjs` is deliberately read-only apart from creating one guest.
  - Node needs `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` to reach the internet in the cloud container; `wait-for-deploy.sh` sets these.
- **Render free plan:**
  - About 512 MB RAM. The server sleeps after 15 minutes idle; the keep-alive workflow prevents this.
  - Builds use `npm run build` (installs server and client, builds the client).
