'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore, useDarkMode } from '@/lib/store';

const NAV = [
  { href: '/', label: 'Upload' },
  { href: '/review', label: 'Review' },
  { href: '/export', label: 'Export' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state } = useStore();
  const { setDark } = useDarkMode();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const counts = {
    photos: state.batches.length,
    books: state.allBooks.length,
    approved: state.allBooks.filter((b) => b.status === 'approved').length,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-cream-300 dark:border-ink-soft bg-cream-50/80 dark:bg-ink/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-cream-50 font-serif text-xl">
              S
            </div>
            <div>
              <div className="font-serif text-lg leading-tight">Skinsbury Library</div>
              <div className="text-xs text-ink/50 dark:text-cream-300/50">
                Personal catalog
              </div>
            </div>
          </div>

          <nav className="flex gap-1 ml-6">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-md text-sm transition-all duration-200 ease-gentle ${
                    active
                      ? 'bg-accent text-cream-50 shadow-sm'
                      : 'text-ink/70 dark:text-cream-300/70 hover:bg-accent-soft dark:hover:bg-ink-soft'
                  }`}
                >
                  {item.label}
                  {item.href === '/review' && state.allBooks.length > 0 && (
                    <span
                      className={`ml-2 text-xs ${
                        active ? 'text-cream-50/80' : 'text-accent'
                      }`}
                    >
                      {state.allBooks.length}
                    </span>
                  )}
                  {item.href === '/export' && counts.approved > 0 && (
                    <span
                      className={`ml-2 text-xs ${
                        active ? 'text-cream-50/80' : 'text-accent'
                      }`}
                    >
                      {counts.approved}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <button
            onClick={() => {
              const next = !isDark;
              setDark(next);
              setIsDark(next);
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-cream-300 dark:border-ink-soft hover:bg-accent-soft dark:hover:bg-ink-soft transition"
            aria-label="Toggle dark mode"
          >
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
      <footer className="border-t border-cream-300 dark:border-ink-soft py-4 text-xs text-center text-ink/40 dark:text-cream-300/40">
        Skinsbury Library — personal use · No data leaves your machine without your approval
      </footer>
    </div>
  );
}
