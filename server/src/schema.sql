-- PlayNest schema (idempotent; runs on every boot)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT,
  is_guest      BOOLEAN NOT NULL DEFAULT TRUE,
  avatar        TEXT NOT NULL DEFAULT '🦊',
  xp            INTEGER NOT NULL DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best    INTEGER NOT NULL DEFAULT 0,
  last_play_date DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per finished play (daily puzzles, reflex runs, party matches, detective cases)
CREATE TABLE IF NOT EXISTS game_results (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game       TEXT NOT NULL,
  play_date  DATE NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  won        BOOLEAN NOT NULL DEFAULT FALSE,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_results_game_date ON game_results (game, play_date, score DESC);
CREATE INDEX IF NOT EXISTS game_results_user ON game_results (user_id, play_date);

-- In-progress / finished state for once-per-day puzzles
CREATE TABLE IF NOT EXISTS daily_progress (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game       TEXT NOT NULL,
  play_date  DATE NOT NULL,
  state      JSONB NOT NULL DEFAULT '{}'::jsonb,
  finished   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game, play_date)
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS detective_cases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source         TEXT NOT NULL,              -- 'ai' | 'builtin'
  secret         JSONB NOT NULL,             -- full case incl. culprit (never sent to client until solved)
  transcripts    JSONB NOT NULL DEFAULT '{}'::jsonb, -- { suspectId: [{role, content}] }
  questions_used INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open', -- 'open' | 'solved' | 'failed'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detective_cases_user ON detective_cases (user_id, created_at DESC);
