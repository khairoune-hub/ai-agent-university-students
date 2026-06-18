import OpenAI from 'openai';
import { env } from '../config/env';
import { getAiSettings } from './settingsService';
import { retrieveContext } from './knowledgeBase';
import { searchPrograms, SearchProgramsResult } from './programsService';
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
    '- للأسئلة العامة (إجراءات، تواريخ، شروط، نصائح): كن مختصرًا جدًا (سطران إلى أربعة).\n' +
    '- عند استعمال أداة search_programs: اذكر كل المؤسسات التي أعادتها الأداة، مصنّفة حسب الفئة ' +
    'بعناوينها العربية، سطر قصير لكل مؤسسة بالشكل «الاسم — المعدل الأدنى». ' +
    'لا تحذف أي مؤسسة ولا تخترع غيرها، وأبرز فئة «المدارس الوطنية العليا» إن وُجدت.';

  const GROUNDING = context
    ? '\n- للأسئلة النصية اعتمد على "المعلومات المرفقة" أدناه؛ إن لم تكفِ فانصح بمراجعة المصدر الرسمي ولا تخترع أرقامًا.'
    : '\n- لا تخترع تواريخ أو عتبات أو إجراءات رسمية؛ وإن لزم رقم رسمي محدد، انصح بمراجعة البوابة الرسمية للتوجيه.';

  const systemContent =
    settings.system_prompt +
    (context
      ? `\n\n---\n[المعلومات المرفقة من قاعدة المعارف والمستندات — استند إليها]:\n${context}`
      : '') +
    STYLE +
    GROUNDING;

  const userContent = input.question + orientationBlock(input.orientation);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];

  const model = normalizeModel(settings.model);
  const startedAt = Date.now();
  let usedTool = false;

  try {
    // Tool-calling loop: the model may call search_programs (exhaustive DB
    // lookup) for "which institutions offer X / minimum to study X" questions,
    // then produce the final answer. Narrative questions use the RAG context.
    for (let iter = 0; iter < 3; iter++) {
      const completion = await client.chat.completions.create({
        model,
        temperature: settings.temperature,
        max_tokens: usedTool ? 2200 : 700,
        tools: PROGRAM_TOOLS,
        tool_choice: iter >= 2 ? 'none' : 'auto', // force an answer on the last turn
        messages,
      });

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      if (msg.tool_calls?.length) {
        usedTool = true;
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            /* ignore malformed args */
          }
          const result = await searchPrograms(args);
          console.log(
            `[programs] search_programs(${JSON.stringify(args)}) -> ${result.total} rows` +
              `${result.truncated ? ' (capped)' : ''}`
          );
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: formatPrograms(result),
          });
        }
        continue; // loop again to let the model answer using the tool output
      }

      const text = msg.content?.trim();
      if (text) {
        console.log(`[ai] ✓ reply in ${Date.now() - startedAt}ms (${text.length} chars, tool=${usedTool})`);
        return text;
      }
    }
    console.warn(`[ai] ✗ no final answer after tool loop (${Date.now() - startedAt}ms)`);
    return 'عذرًا، لم أتمكّن من توليد إجابة الآن. حاول إعادة صياغة سؤالك بعد قليل.';
  } catch (err: any) {
    const detail = err?.error?.message ?? err?.message ?? String(err);
    console.error(
      `[ai] ✗ AI request failed (model "${settings.model}", ${Date.now() - startedAt}ms):`,
      detail
    );
    return 'عذرًا، تعذّر الوصول إلى خدمة الذكاء الاصطناعي حاليًا. حاول مرة أخرى بعد قليل.';
  }
}

// ── search_programs tool ────────────────────────────────────
const PROGRAM_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_programs',
      description:
        'ابحث في قاعدة البيانات الرسمية للتخصصات الجامعية (المعدلات الدنيا للبكالوريا 2025) ' +
        'لإرجاع كل المؤسسات المطابقة. استعملها عندما يسأل الطالب: أي جامعات/مؤسسات تدرّس تخصصًا، ' +
        'ما المعدل الأدنى لتخصص، أو عن المدارس العليا. ترجم اسم التخصص إلى الفرنسية (البيانات بالفرنسية).',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description:
              'اسم التخصص أو المجال بالفرنسية، مثل: informatique, medecine, droit, mathematiques, "genie civil", pharmacie',
          },
          institution_type: {
            type: 'string',
            enum: [
              'ecole_nationale_superieure',
              'ecole_normale_superieure',
              'universite',
              'centre_universitaire',
              'institut',
              'centre_formation',
              'recrutement_national',
            ],
            description: 'تصفية حسب نوع المؤسسة (اختياري)',
          },
        },
      },
    },
  },
];

function formatPrograms(r: SearchProgramsResult): string {
  if (r.total === 0) return 'لا توجد نتائج مطابقة في قاعدة البيانات.';
  let out = `إجمالي النتائج: ${r.total}${r.truncated ? ' (تم بلوغ الحد الأقصى 150)' : ''}`;
  for (const g of r.groups) {
    out += `\n\n## ${g.label} (${g.count}):`;
    for (const row of g.rows) {
      const mins = [row.min1, row.min2, row.min3].filter((v) => v != null).join('/') || '—';
      out += `\n- ${row.institution_name} — ${row.filiere_name} — المعدل الأدنى: ${mins}`;
    }
  }
  return out;
}
