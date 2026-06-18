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

-- Per-user conversation history so the bot remembers previous turns.
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role        TEXT NOT NULL,   -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON chat_messages (telegram_id, created_at DESC);

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

-- ── RAG: uploaded documents (PDFs) and their text chunks ────
-- An uploaded source document (e.g. a PDF the admin uploads).
CREATE TABLE IF NOT EXISTS documents (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  filename    TEXT,
  source_type TEXT NOT NULL DEFAULT 'pdf',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  embedded    BOOLEAN NOT NULL DEFAULT false, -- true once chunks have vectors
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Text chunks extracted from a document. The `embedding` vector column is added
-- separately (and conditionally) in migrate.ts, since pgvector may be absent.
CREATE TABLE IF NOT EXISTS document_chunks (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks (document_id);

-- Keyword fallback search over chunk text (works without pgvector).
CREATE INDEX IF NOT EXISTS idx_chunks_search
  ON document_chunks
  USING GIN (to_tsvector('simple', coalesce(content, '')));

-- ── Structured orientation data (parsed from the official PDFs) ──
-- These hold the BAC minimum-averages table as real relational rows so the bot
-- can answer aggregation queries ("all institutions offering X") exhaustively,
-- instead of top-k RAG which can only return a few examples.

CREATE TABLE IF NOT EXISTS institutions (
  code             TEXT PRIMARY KEY,        -- e.g. 'U12', 'P04', 'C99'
  name             TEXT NOT NULL,
  wilaya           TEXT,
  institution_type TEXT NOT NULL,           -- universite | ecole_nationale_superieure |
                                            -- ecole_normale_superieure | institut |
                                            -- centre_universitaire | centre_formation |
                                            -- recrutement_national | autre
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS specialties (
  filiere_code  TEXT PRIMARY KEY,           -- e.g. 'C01LAL01'
  filiere_name  TEXT NOT NULL,              -- e.g. 'INFORMATIQUE'
  domain        TEXT
);

CREATE TABLE IF NOT EXISTS offerings (
  id               BIGSERIAL PRIMARY KEY,
  institution_code TEXT NOT NULL REFERENCES institutions(code) ON DELETE CASCADE,
  filiere_code     TEXT NOT NULL REFERENCES specialties(filiere_code) ON DELETE CASCADE,
  min1             NUMERIC,
  min2             NUMERIC,
  min3             NUMERIC,
  year             INTEGER NOT NULL,
  UNIQUE (institution_code, filiere_code, year)
);

CREATE INDEX IF NOT EXISTS idx_offerings_filiere ON offerings (filiere_code);
CREATE INDEX IF NOT EXISTS idx_offerings_institution ON offerings (institution_code);
-- Trigram indexes for fuzzy keyword matching are created in migrate.ts (they
-- need the pg_trgm extension, which — like pgvector — may not be present).
