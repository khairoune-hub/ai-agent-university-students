'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getUsername } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: '📊' },
  { href: '/articles', label: 'المقالات', icon: '📚' },
  { href: '/announcements', label: 'الإعلانات', icon: '📢' },
  { href: '/ai-settings', label: 'إعدادات الذكاء', icon: '🤖' },
  { href: '/users', label: 'المستخدمون', icon: '👥' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <span className="text-2xl">🎓</span>
        <span className="font-bold text-slate-800">موجّه</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 px-3 text-xs text-slate-400">
          {getUsername() ?? 'admin'}
        </div>
        <button onClick={logout} className="btn-secondary w-full text-red-600">
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
