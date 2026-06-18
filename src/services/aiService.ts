import OpenAI from 'openai';
import { env } from '../config/env';
import { getAiSettings } from './settingsService';
import { retrieveContext } from './knowledgeBase';
import { OrientationData } from './types';

// OpenRouter is OpenAI-API-compatible, so we reuse the official SDK with a
// custom base URL. The model/temperature/system prompt are loaded dynamically
// from the database on every call (no hardcoded prompts).
const client = new OpenAI({
  apiKey: env.openRouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  // Never hang forever: if a model is slow/queued (some free models are),
  // fail after 45s so the bot can tell the user instead of going silent.
  timeout: 45_000,
  maxRetries: 1,
  defaultHeaders: {
    ...(env.openRouterSiteUrl ? { 'HTTP-Referer': env.openRouterSiteUrl } : {}),
    'X-Title': env.openRouterAppName,
  },
});

export interface AiReplyInput {
  question: string;
  orientation?: OrientationData | null;
}

function orientationBlock(orientation?: OrientationData | null): string {
  if (!orientation) return '';
  const parts: string[] = [];
  if (orientation.stream) parts.push(`الشعبة: ${orientation.stream}`);
  if (orientation.score) parts.push(`المعدل: ${orientation.score}`);
  if (orientation.interests) parts.push(`الاهتمامات: ${orientation.interests}`);
  if (parts.length === 0) return '';
  return `\n\n[بيانات الطالب]\n${parts.join('\n')}`;
}

/**
 * Generates an AI answer for a student's question:
 *  1. Load AI settings (system prompt, model, temperature) from DB.
 *  2. Find relevant knowledge-base articles via keyword search.
 *  3. Build the prompt (system + KB context + student data + question).
 *  4. Call OpenRouter and return the text.
 */
export async function generateReply(input: AiReplyInput): Promise<string> {
  if (!env.openRouterApiKey) {
    return 'عذرًا، خدمة الذكاء الاصطناعي غير مهيّأة حاليًا. يرجى المحاولة لاحقًا.';
  }

  const settings = await getAiSettings();
  const { context, articleCount, chunkCount } = await retrieveContext(input.question);
  console.log(
    `[ai] model=${settings.model} | articles=${articleCount} docChunks=${chunkCount} | temp=${settings.temperature}`
  );

  // Always enforce a concise, well-structured answer on top of the admin's
  // system prompt — students want short, scannable replies, not essays.
  const BREVITY =
    '\n\n[تعليمات الأسلوب] أجب بإيجاز شديد ومباشر: من 3 إلى 6 أسطر كحد أقصى، ' +
    'أو نقاط قصيرة عند الحاجة. تجنّب المقدمات الطويلة والتكرار، وادخل في صلب الجواب فورًا.';

  const systemContent =
    settings.system_prompt +
    (context
      ? `\n\n---\nمعلومات من قاعدة المعارف (استعملها عند الإجابة إن كانت ذات صلة):\n${context}`
      : '') +
    BREVITY;

  const userContent = input.question + orientationBlock(input.orientation);

  const startedAt = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const ms = Date.now() - startedAt;
    if (text) {
      console.log(`[ai] ✓ reply in ${ms}ms (${text.length} chars)`);
      return text;
    }
    // Some (often free/queued) models return an empty completion.
    console.warn(`[ai] ✗ empty completion from "${settings.model}" after ${ms}ms`);
    return 'عذرًا، لم أتمكّن من توليد إجابة الآن. حاول إعادة صياغة سؤالك بعد قليل.';
  } catch (err: any) {
    // Surface the real cause in logs (model not found, rate limit, timeout…)
    const detail = err?.error?.message ?? err?.message ?? String(err);
    console.error(
      `[ai] ✗ OpenRouter failed (model "${settings.model}", ${Date.now() - startedAt}ms):`,
      detail
    );
    return 'عذرًا، تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا. حاول مرة أخرى بعد قليل.';
  }
}
