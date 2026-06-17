'use client';

import { useEffect, useState } from 'react';
import { api, User } from '@/lib/api';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listUsers()
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">المستخدمون</h1>
        <span className="text-sm text-slate-500">الإجمالي: {total}</span>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">جاري التحميل...</p>
      ) : users.length === 0 ? (
        <div className="card text-center text-slate-400">لا يوجد مستخدمون بعد.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">المعرّف</th>
                <th className="px-4 py-3 font-medium">الشعبة</th>
                <th className="px-4 py-3 font-medium">المعدل</th>
                <th className="px-4 py-3 font-medium">الاهتمامات</th>
                <th className="px-4 py-3 font-medium">آخر نشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {u.first_name || '—'}
                    {u.username && <span className="text-slate-400"> @{u.username}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.telegram_id}</td>
                  <td className="px-4 py-3 text-slate-600">{u.orientation_data?.stream || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{u.orientation_data?.score || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {u.orientation_data?.interests || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(u.last_active_at).toLocaleDateString('ar')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
