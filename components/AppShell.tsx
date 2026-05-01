'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDarkMode } from '@/lib/store';

const NAV = [
  { href: '/', label: 'Upload' },
  { href: '/review', label: 'Review' },
  { href: '/export', label: 'Export' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setDark } = useDarkMode();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-accent dark:bg-green-deep sticky top-0 z-10 shadow-sm">
        {/* Three-zone grid: left wordmark anchor / centered nav / right toggle.
            grid-cols-[auto_1fr_auto] gives the nav the entire middle column so
            it centers cleanly regardless of how wide the side zones grow. */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center py-4 pl-7 pr-6 lg:pl-8 lg:pr-8">
          {/* Left anchor — engraved-plaque wordmark, the entire block links home. */}
          <Link
            href="/"
            className="flex flex-col leading-none group"
            aria-label="Carnegie — go to upload"
          >
            <span
              className="font-display text-limestone group-hover:text-brass transition-colors"
              style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '1px', lineHeight: 1 }}
            >
              Carnegie
            </span>
            <span
              className="text-[10px] uppercase text-brass mt-1.5"
              style={{ letterSpacing: '2.5px' }}
            >
              Personal Cataloging System
            </span>
          </Link>

          {/* Center zone — nav pills sit centered in the remaining space. */}
          <nav className="flex justify-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-md text-sm transition-all duration-200 ease-gentle ${
                    active
                      ? 'bg-brass text-accent-deep font-medium shadow-sm'
                      : 'text-limestone/85 hover:bg-fern hover:text-limestone'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right anchor — light/dark toggle. */}
          <button
            onClick={() => {
              const next = !isDark;
              setDark(next);
              setIsDark(next);
            }}
            className="justify-self-end flex-shrink-0 text-sm px-3.5 py-1.5 rounded-md border border-limestone/40 text-limestone bg-fern/40 hover:bg-fern transition"
            aria-label="Toggle dark mode"
          >
            {isDark ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-8 lg:px-12 py-10">{children}</main>
      <footer className="border-t border-cream-300 dark:border-ink-soft py-5 text-sm text-center text-ink/40 dark:text-cream-300/40">
        Carnegie — personal use · No data leaves your machine without your approval
      </footer>
    </div>
  );
}
