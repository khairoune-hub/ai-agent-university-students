'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

// Root route just redirects based on auth state.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isAuthenticated() ? '/dashboard' : '/login');
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center text-slate-500">جاري التحميل...</div>
  );
}
