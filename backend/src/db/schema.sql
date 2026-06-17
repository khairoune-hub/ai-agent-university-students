-- UniBot schema — single-admin MVP
-- Safe to run multiple times (idempotent).

-- Students who interact with the Telegram bot
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  telegram_id     BIGINT NOT NULL UNIQUE,
  username        TEXT,
  first_name      TEXT,
  -- Collected by the /orientation questionnaire: { stream, score, interests }
  orientation_data JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);

-- Knowledge base articles injected into AI prompts via keyword search
CREATE TABLE IF NOT EXISTS articles (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full-text search over title + content (language-agnostic 'simple' config so
-- Arabic / French / English all behave reasonably for keyword matching).
CREATE INDEX IF NOT EXISTS idx_articles_search
  ON articles
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')));

CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);

-- Broadcast announcements
CREATE TABLE IF NOT EXISTS announcements (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  -- NULL until broadcast; set to the time the admin sent it
  sent_at     TIMESTAMPTZ,
  sent_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row table holding editable AI configuration
CREATE TABLE IF NOT EXISTS ai_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  system_prompt TEXT NOT NULL,
  model         TEXT NOT NULL,
  temperature   REAL NOT NULL DEFAULT 0.7,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Enforce a single settings row
  CONSTRAINT ai_settings_singleton CHECK (id = 1)
);
