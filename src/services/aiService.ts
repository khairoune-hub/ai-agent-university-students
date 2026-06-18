import OpenAI from 'openai';
import { env } from '../config/env';
import { getAiSettings } from './settingsService';
import { retrieveContext } from './knowledgeBase';
import { OrientationData } from './types';

// Chat provider is OpenAI-API-compatible (OpenAI direct or OpenRouter). The
// base URL + key come from env; the model/temperature/system prompt are loaded
// dynamically from the database on every call (no hardcoded prompts).
const client = new OpenAI({
  apiKey: env.llmApiKey,
  baseURL: env.llmBaseUrl,
  // Never hang forever: fail after 45s so the bot can tell the user instead of
  // going silent.
  timeout: 45_000,
  maxRetries: 1,
  defaultHeaders: env.llmIsOpenAI
    ? undefined
    : {
        ...(env.openRouterSiteUrl ? { 'HTTP-Referer': env.openRouterSiteUrl } : {}),
        'X-Title': env.openRouterAppName,
      },
});

const OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';

// When talking to OpenAI directly, normalise the model name so a stale or
// OpenRouter-style id (e.g. "nvidia/...:free" or "openai/gpt-4o-mini") can't
// break the bot — fall back to a known-good OpenAI model.
function normalizeModel(model: string): string {
  if (!env.llmIsOpenAI) return model;
  let m = (model || '').trim();
  if (m.startsWith('openai/')) m = m.slice('openai/'.length);
  // OpenAI model ids never contain "/" or ":" — anything that does is invalid here.
  if (!m || m.includes('/') || m.includes(':')) {
    console.warn(`[ai] "${model}" is not a valid OpenAI model — using ${OPENAI_FALLBACK_MODEL}`);
    return OPENAI_FALLBACK_MODEL;
  }
  return m;
}

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
  if (!env.llmApiKey) {
    return 'عذرًا، خدمة الذكاء الاصطناعي غير مهيّأة حاليًا. يرجى المحاولة لاحقًا.';
  }

  const settings = await getAiSettings();
  const { context, articleCount, chunkCount } = await retrieveContext(input.question);
  console.log(
    `[ai] model=${settings.model} | articles=${articleCount} docChunks=${chunkCount} | temp=${settings.temperature}`
  );

  // Style + grounding rules layered on top of the admin's system prompt.
  const STYLE =
    '\n\n[تعليمات صارمة]\n' +
    '- أجب مباشرة بالإجابة النهائية فقط، دون إظهار أي تفكير أو خطوات داخلية.\n' +
    '- كن مختصرًا جدًا: من سطرين إلى أربعة أسطر، أو نقاط قصيرة عند الحاجة.\n' +
    '- لا تذكر أسماء المستندات أو الجداول، فقط أعطِ الخلاصة المفيدة للطالب.';

  // Anti-bluff: when we have retrieved context, force the model to ground its
  // answer in it; otherwise forbid inventing official figures/dates.
  const GROUNDING = context
    ? '\n- اعتمد في إجابتك على "المعلومات المرفقة" أدناه. إذا لم تكفِ للإجابة، قل بوضوح إنك غير متأكد وانصح بمراجعة المصدر الرسمي، ولا تخترع أرقامًا أو شروطًا.'
    : '\n- لا تملك معلومات مرفقة لهذا السؤال. أجب بمعلومات عامة موثوقة فقط، ولا تخترع تواريخ أو عتبات أو إجراءات رسمية؛ وإن لزم رقم رسمي محدد، انصح بمراجعة البوابة الرسمية للتوجيه.';

  const systemContent =
    settings.system_prompt +
    (context
      ? `\n\n---\n[المعلومات المرفقة من قاعدة المعارف والمستندات — استند إليها]:\n${context}`
      : '') +
    STYLE +
    GROUNDING;

  const userContent = input.question + orientationBlock(input.orientation);

  const startedAt = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: normalizeModel(settings.model),
      temperature: settings.temperature,
      max_tokens: 400,
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
      `[ai] ✗ AI request failed (model "${settings.model}", ${Date.now() - startedAt}ms):`,
      detail
    );
    return 'عذرًا، تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا. حاول مرة أخرى بعد قليل.';
  }
}
