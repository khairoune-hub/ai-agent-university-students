'use client';

import { useEffect, useState, FormEvent } from 'react';
import { api, Announcement } from '@/lib/api';
import Modal from '@/components/Modal';

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.listAnnouncements());
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createAnnouncement(form);
      setForm({ title: '', message: '' });
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onSend(a: Announcement) {
    if (!confirm(`إرسال "${a.title}" إلى جميع المستخدمين؟`)) return;
    setSendingId(a.id);
    setNotice('');
    try {
      const res = await api.sendAnnouncement(a.id);
      setNotice(`تم الإرسال إلى ${res.delivered} من ${res.total} مستخدم.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingId(null);
    }
  }

  async function onDelete(a: Announcement) {
    if (!confirm(`حذف الإعلان "${a.title}"؟`)) return;
    try {
      await api.deleteAnnouncement(a.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">الإعلانات</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          + إعلان جديد
        </button>
      </div>

      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">جاري التحميل...</p>
      ) : items.length === 0 ? (
        <div className="card text-center text-slate-400">لا توجد إعلانات بعد.</div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{a.title}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        a.sent_at
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {a.sent_at ? `أُرسل إلى ${a.sent_count}` : 'مسودة'}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.message}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(a.created_at).toLocaleString('ar')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    className="btn-primary py-1"
                    onClick={() => onSend(a)}
                    disabled={sendingId === a.id}
                  >
                    {sendingId === a.id ? 'جاري الإرسال...' : a.sent_at ? 'إعادة إرسال' : 'إرسال'}
                  </button>
                  <button className="btn-danger py-1" onClick={() => onDelete(a)}>
                    حذف
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="إعلان جديد" onClose={() => setModalOpen(false)}>
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
            <label className="label">الرسالة</label>
            <textarea
              className="input min-h-[120px]"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="مثال: تبدأ المرحلة الثانية للتسجيل غدًا."
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
