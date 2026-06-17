import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import api from './routes';
import { startBot } from './bot/bot';
import { pool } from './db/pool';

async function main() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', botEnabled: env.botEnabled });
  });

  // Admin REST API
  app.use('/api', api);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('[db] Connected');
  } catch (err) {
    console.error('[db] Failed to connect. Did you run `npm run migrate`?', err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`[api] Listening on http://localhost:${env.port}`);
  });

  // Start the Telegram bot (long polling) unless disabled
  if (env.botEnabled) {
    if (!env.telegramBotToken) {
      console.warn('[bot] BOT_ENABLED is true but TELEGRAM_BOT_TOKEN is missing — bot not started.');
    } else {
      try {
        await startBot();
      } catch (err) {
        console.error('[bot] Failed to start:', err);
      }
    }
  } else {
    console.log('[bot] Disabled via BOT_ENABLED=false');
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
