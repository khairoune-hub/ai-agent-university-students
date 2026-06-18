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

// If OPENAI_API_KEY is set, both chat and embeddings default to OpenAI directly.
// Otherwise they default to OpenRouter. Individual LLM_* / EMBEDDINGS_* vars
// still override these defaults.
const openaiKey = process.env.OPENAI_API_KEY ?? '';
const openRouterKey = process.env.OPENROUTER_API_KEY ?? '';
const useOpenAI = openaiKey.trim() !== '';
const defaultAiKey = openaiKey || openRouterKey;
const defaultBaseUrl = useOpenAI ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';

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

  openRouterApiKey: openRouterKey,
  openRouterSiteUrl: optional('OPENROUTER_SITE_URL', ''),
  openRouterAppName: optional('OPENROUTER_APP_NAME', 'UniBot'),

  // ── Chat LLM ──
  // Defaults to OpenAI when OPENAI_API_KEY is set, otherwise OpenRouter.
  llmApiKey: optional('LLM_API_KEY', defaultAiKey),
  llmBaseUrl: optional('LLM_BASE_URL', defaultBaseUrl),
  // Whether the chat endpoint is OpenAI direct (affects model-name normalisation).
  llmIsOpenAI: optional('LLM_BASE_URL', defaultBaseUrl).includes('api.openai.com'),

  // ── Embeddings (semantic RAG) ──
  // Defaults to the same provider/key as chat. Point these at any
  // OpenAI-compatible embeddings endpoint to use a different provider.
  // If no key is available, the app runs in keyword-only mode.
  embeddingsApiKey: optional('EMBEDDINGS_API_KEY', defaultAiKey),
  embeddingsBaseUrl: optional('EMBEDDINGS_BASE_URL', defaultBaseUrl),
  embeddingsModel: optional(
    'EMBEDDINGS_MODEL',
    useOpenAI ? 'text-embedding-3-small' : 'openai/text-embedding-3-small'
  ),
};

// Vector dimension for the document_chunks.embedding column. Must match the
// embeddings model (OpenAI text-embedding-3-small = 1536). Changing this
// requires re-running the migration.
export const EMBEDDING_DIM = parseInt(optional('EMBEDDINGS_DIM', '1536'), 10);

export const isProd = env.nodeEnv === 'production';
