'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, Article } from '@/lib/api';
import Modal from '@/components/Modal';

const CATEGORIES = ['Specialties', 'Universities', 'Registration Process', 'FAQs'];

const emptyForm = { title: '', category: CATEGORIES[0], content: '' };

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setArticles(await api.listArticles());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(a: Article) {
    setEditing(a);
    setForm({ title: a.title, category: a.category, content: a.content });
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateArticle(editing.id, form);
      } else {
        await api.createArticle(form);
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(a: Article) {
    if (!confirm(`حذف المقال "${a.title}"؟`)) return;
    try {
      await api.deleteArticle(a.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">المقالات (قاعدة المعارف)</h1>
        <button className="btn-primary" onClick={openCreate}>
          + مقال جديد
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">جاري التحميل...</p>
      ) : articles.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد مقالات بعد.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">التصنيف</th>
                <th className="px-4 py-3 font-medium">آخر تحديث</th>
                <th className="px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.title}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                      {a.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(a.updated_at).toLocaleDateString('ar')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="btn-secondary py-1" onClick={() => openEdit(a)}>
                        تعديل
                      </button>
                      <button className="btn-danger py-1" onClick={() => onDelete(a)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'تعديل المقال' : 'مقال جديد'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">العنوان</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">التصنيف</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المحتوى</label>
            <textarea
              className="input min-h-[160px]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
