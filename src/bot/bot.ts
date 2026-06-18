import { Bot } from 'grammy';
import { env } from '../config/env';
import { messages } from './messages';
import {
  upsertUser,
  getUserByTelegramId,
  setOrientationData,
} from '../services/usersService';
import { generateReply } from '../services/aiService';
import { OrientationData } from '../services/types';

// ── Orientation questionnaire state ─────────────────────────
// Simple in-memory step machine. Fine for a single-instance MVP; if you ever
// scale to multiple instances, move this into the DB or Redis.
type OrientationStep = 'stream' | 'score' | 'interests';
interface OrientationSession {
  step: OrientationStep;
  data: OrientationData;
}
const orientationSessions = new Map<string, OrientationSession>();

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

export function createBot(): Bot {
  if (!env.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set but BOT_ENABLED is true');
  }
  const b = new Bot(env.telegramBotToken);

  // Track every interaction's user (upsert + last_active)
  b.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      try {
        await upsertUser({
          telegramId: ctx.from.id,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
        });
      } catch (err) {
        console.error('[bot] upsertUser failed', err);
      }
    }
    await next();
  });

  // /start
  b.command('start', async (ctx) => {
    orientationSessions.delete(String(ctx.from?.id));
    await ctx.reply(messages.welcome(ctx.from?.first_name), { parse_mode: 'Markdown' });
  });

  // /help
  b.command('help', async (ctx) => {
    await ctx.reply(messages.help, { parse_mode: 'Markdown' });
  });

  // /orientation — begin questionnaire
  b.command('orientation', async (ctx) => {
    const id = String(ctx.from?.id);
    orientationSessions.set(id, { step: 'stream', data: {} });
    await ctx.reply(messages.orientationIntro);
    await ctx.reply(messages.askStream);
  });

  // /cancel — abort questionnaire
  b.command('cancel', async (ctx) => {
    const id = String(ctx.from?.id);
    if (orientationSessions.has(id)) {
      orientationSessions.delete(id);
      await ctx.reply(messages.orientationCancelled);
    } else {
      await ctx.reply(messages.help, { parse_mode: 'Markdown' });
    }
  });

  // Free text: either advance the questionnaire or ask the AI
  b.on('message:text', async (ctx) => {
    const id = String(ctx.from.id);
    const text = ctx.message.text.trim();

    // Ignore unknown slash commands here (commands handled above)
    if (text.startsWith('/')) return;

    // Mid-questionnaire?
    const session = orientationSessions.get(id);
    if (session) {
      await handleOrientationStep(ctx, id, session, text);
      return;
    }

    if (!text) {
      await ctx.reply(messages.emptyQuestion);
      return;
    }

    // Normal question → AI.
    // Telegram's "typing" action only lasts ~5s, but a reply can take ~10s+,
    // so re-send it every 4s until the answer is ready.
    await ctx.replyWithChatAction('typing');
    const typing = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 4000);
    try {
      const user = await getUserByTelegramId(id);
      const answer = await generateReply({
        question: text,
        orientation: user?.orientation_data ?? null,
      });
      await ctx.reply(answer);
    } catch (err) {
      console.error('[bot] generateReply failed', err);
      await ctx.reply(messages.error);
    } finally {
      clearInterval(typing);
    }
  });

  b.catch((err) => {
    console.error('[bot] Unhandled error', err.error);
  });

  bot = b;
  return b;
}

async function handleOrientationStep(
  ctx: any,
  id: string,
  session: OrientationSession,
  text: string
): Promise<void> {
  switch (session.step) {
    case 'stream':
      session.data.stream = text;
      session.step = 'score';
      await ctx.reply(messages.askScore);
      break;
    case 'score':
      session.data.score = text;
      session.step = 'interests';
      await ctx.reply(messages.askInterests);
      break;
    case 'interests':
      session.data.interests = text;
      orientationSessions.delete(id);
      try {
        await setOrientationData(id, session.data);
      } catch (err) {
        console.error('[bot] setOrientationData failed', err);
      }
      await ctx.reply(messages.orientationSaved(session.data));
      break;
  }
}

/**
 * Broadcasts a message to all known users. Sends sequentially with a small
 * delay to respect Telegram rate limits. Returns the number of successful
 * deliveries. Blocked/deleted users are skipped silently.
 */
export async function broadcast(
  telegramIds: string[],
  text: string
): Promise<number> {
  const b = bot;
  if (!b) throw new Error('Bot is not running — cannot broadcast');

  let delivered = 0;
  for (const chatId of telegramIds) {
    try {
      await b.api.sendMessage(chatId, text);
      delivered++;
    } catch (err: any) {
      // 403 = user blocked the bot; just skip.
      console.warn(`[broadcast] failed for ${chatId}: ${err?.description ?? err}`);
    }
    // ~25 msgs/sec is the safe ceiling; 40ms keeps us under it.
    await new Promise((r) => setTimeout(r, 40));
  }
  return delivered;
}

export async function startBot(): Promise<void> {
  const b = bot ?? createBot();
  // Make commands appear in the Telegram UI menu
  try {
    await b.api.setMyCommands([
      { command: 'start', description: 'بدء استخدام البوت' },
      { command: 'orientation', description: 'استبيان التوجيه' },
      { command: 'help', description: 'المساعدة' },
    ]);
  } catch (err: any) {
    console.warn('[bot] setMyCommands failed (non-fatal):', err?.description ?? err);
  }
  // Launch polling in the background with retry. Crucially, a polling failure
  // (e.g. 409 Conflict when another instance is running, or a transient network
  // error) must NEVER crash the process — the API + admin panel keep working.
  void pollWithRetry(b);
}

// Long polling (no webhook needed for MVP), made resilient.
async function pollWithRetry(b: Bot, attempt = 0): Promise<void> {
  try {
    await b.start({
      // Clear any backlog/leftover poller on (re)start.
      drop_pending_updates: true,
      onStart: (info) => console.log(`[bot] Started as @${info.username}`),
    });
  } catch (err: any) {
    const isConflict = err?.error_code === 409;
    if (isConflict && attempt < 12) {
      // Usually a brief overlap during a redeploy — back off and retry so the
      // bot recovers on its own once the other instance stops.
      console.warn(
        `[bot] 409 Conflict — another instance is polling. Retry ${attempt + 1}/12 in 5s...`
      );
      await new Promise((r) => setTimeout(r, 5000));
      return pollWithRetry(b, attempt + 1);
    }
    // Give up polling but keep the API alive.
    console.error(
      '[bot] Polling stopped (API stays up). Cause:',
      err?.description ?? err
    );
  }
}
