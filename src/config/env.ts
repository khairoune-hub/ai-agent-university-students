import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '4000'), 10),
  corsOrigins: optional('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL'),
  pgSsl: bool('PGSSL', false),

  adminUsername: required('ADMIN_USERNAME'),
  adminPassword: required('ADMIN_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '12h'),

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  botEnabled: bool('BOT_ENABLED', true),

  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openRouterSiteUrl: optional('OPENROUTER_SITE_URL', ''),
  openRouterAppName: optional('OPENROUTER_APP_NAME', 'UniBot'),

  // ── Embeddings (semantic RAG) ──
  // Defaults to OpenRouter with the same key, so semantic search "just works"
  // once the OpenRouter account has credits. Point these at any OpenAI-compatible
  // embeddings endpoint (OpenAI, Jina, etc.) to use a different/free provider.
  // If no key is available, the app runs in keyword-only mode.
  embeddingsApiKey: optional('EMBEDDINGS_API_KEY', process.env.OPENROUTER_API_KEY ?? ''),
  embeddingsBaseUrl: optional('EMBEDDINGS_BASE_URL', 'https://openrouter.ai/api/v1'),
  embeddingsModel: optional('EMBEDDINGS_MODEL', 'openai/text-embedding-3-small'),
};

// Vector dimension for the document_chunks.embedding column. Must match the
// embeddings model (OpenAI text-embedding-3-small = 1536). Changing this
// requires re-running the migration.
export const EMBEDDING_DIM = parseInt(optional('EMBEDDINGS_DIM', '1536'), 10);

export const isProd = env.nodeEnv === 'production';
