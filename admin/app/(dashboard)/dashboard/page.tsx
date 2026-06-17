'use client';

import { useEffect, useState } from 'react';
import { api, DashboardData } from '@/lib/api';

const STAT_CARDS: { key: keyof DashboardData['stats']; label: string; icon: string }[] = [
  { key: 'users', label: 'الطلبة المسجلون', icon: '👥' },
  { key: 'articles', label: 'المقالات', icon: '📚' },
  { key: 'announcements', label: 'الإعلانات', icon: '📢' },
  { key: 'announcementsSent', label: 'إعلانات مُرسَلة', icon: '✅' },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((c) => (
          <div key={c.key} className="card">
            <div className="text-3xl">{c.icon}</div>
            <div className="mt-2 text-3xl font-bold text-slate-800">{data.stats[c.key]}</div>
            <div className="text-sm text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">أحدث الطلبة</h2>
          {data.recentUsers.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد مستخدمون بعد.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">
                    {u.first_name || 'مستخدم'}{' '}
                    {u.username && <span className="text-slate-400">@{u.username}</span>}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(u.last_active_at).toLocaleDateString('ar')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800">أحدث الإعلانات</h2>
          {data.recentAnnouncements.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد إعلانات بعد.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentAnnouncements.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{a.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.sent_at ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {a.sent_at ? `أُرسل (${a.sent_count})` : 'مسودة'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
