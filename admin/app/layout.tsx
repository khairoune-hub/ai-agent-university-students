import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UniBot — لوحة التحكم',
  description: 'لوحة تحكم مساعد التوجيه الجامعي',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
