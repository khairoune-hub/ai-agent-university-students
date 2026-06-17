'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api } from '@/lib/api';

// A few common OpenRouter model ids for convenience; admin can type any value.
const MODEL_SUGGESTIONS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-70b-instruct',
];

export default function AiSettingsPage() {
  const [form, setForm] = useState({ system_prompt: '', model: '', temperature: 0.6 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api
      .getSettings()
      .then((s) =>
        setForm({
          system_prompt: s.system_prompt,
          model: s.model,
          temperature: s.temperature,
        })
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await api.updateSettings({
        system_prompt: form.system_prompt,
        model: form.model,
        temperature: Number(form.temperature),
      });
      setNotice('تم حفظ الإعدادات بنجاح.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">إعدادات الذكاء الاصطناعي</h1>
      <p className="text-sm text-slate-500">
        يقرأ البوت هذه الإعدادات ديناميكيًا عند كل رسالة — لا توجد قيم مكتوبة في الكود.
      </p>

      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={onSubmit} className="card space-y-5">
        <div>
          <label className="label">الموجّه النظامي (System Prompt)</label>
          <textarea
            className="input min-h-[260px] leading-relaxed"
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="label">النموذج (OpenRouter Model)</label>
            <input
              className="input"
              list="model-suggestions"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              required
            />
            <datalist id="model-suggestions">
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label">درجة الحرارة (Temperature): {form.temperature}</label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-400">
              0 = إجابات دقيقة وثابتة، 2 = إجابات أكثر إبداعًا وتنوعًا.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </form>
    </div>
  );
}
