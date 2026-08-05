'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';

const NAV_ITEMS = [
  { id: 'story', label: '物語' },
  { id: 'concept', label: 'コンセプト' },
  { id: 'tane-i', label: 'TANE:i' },
  { id: 'flow', label: 'TANE:iの流れ' },
  { id: 'works', label: '作品' },
  { id: 'community', label: 'コミュニティ' },
  { id: 'future', label: '未来' },
] as const;

export default function Header() {
  const [activeSection, setActiveSection] = useState<string>('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ヘッダーの背景・影は、ページ先頭にいる間は透明にして、スクロール後だけ実体化させる
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 現在ビューポート内にあるセクションに応じて、ナビの表示をハイライトする（スクロール連動）
  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        isScrolled || isMobileMenuOpen
          ? 'bg-[#FAF8F4]/85 backdrop-blur-md border-b border-[#1F3028]/8'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 sm:px-10 h-[76px]">
        <a href="#" className="inline-grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
          <span className="text-xl leading-none">🌱</span>
          <span className="col-start-2 text-[15px] font-medium tracking-[0.1em] text-[#1F3028]">
            TANE PROJECT
          </span>
          <span className="col-start-2 text-[10px] tracking-[0.18em] text-[#8A8A8A]">
            Ideas into Reality.
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-10">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleNavClick(e, item.id)}
              className={`relative pb-1 text-[13px] font-normal tracking-wide transition-colors ${
                activeSection === item.id ? 'text-[#1F3028]' : 'text-[#8A8A8A] hover:text-[#1F3028]'
              }`}
            >
              {item.label}
              <span
                className={`absolute inset-x-0 -bottom-0.5 h-px origin-left bg-[#5F8D69] transition-transform duration-300 ${
                  activeSection === item.id ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </a>
          ))}
        </nav>

        <div className="hidden lg:block">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1F3028] px-5 py-2.5 text-[13px] font-medium text-[#FAF8F4] transition-colors hover:bg-[#5F8D69]"
          >
            TANE:iをはじめる
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="lg:hidden flex h-9 w-9 flex-col items-center justify-center gap-1.5"
          aria-label={isMobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          aria-expanded={isMobileMenuOpen}
        >
          <span
            className={`block h-px w-5 bg-[#1F3028] transition-transform duration-200 ${
              isMobileMenuOpen ? 'translate-y-[6.5px] rotate-45' : ''
            }`}
          />
          <span
            className={`block h-px w-5 bg-[#1F3028] transition-opacity duration-200 ${
              isMobileMenuOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`block h-px w-5 bg-[#1F3028] transition-transform duration-200 ${
              isMobileMenuOpen ? '-translate-y-[6.5px] -rotate-45' : ''
            }`}
          />
        </button>
      </div>

      {isMobileMenuOpen && (
        <nav className="lg:hidden border-t border-[#1F3028]/8 bg-[#FAF8F4]/95 px-6 py-2 backdrop-blur-md">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleNavClick(e, item.id)}
              className={`block border-b border-[#1F3028]/5 py-3.5 text-base font-normal last:border-0 ${
                activeSection === item.id ? 'text-[#1F3028]' : 'text-[#8A8A8A]'
              }`}
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/app"
            className="mt-3 mb-2 flex items-center justify-center rounded-full bg-[#1F3028] px-5 py-3 text-[14px] font-medium text-[#FAF8F4]"
          >
            TANE:iをはじめる
          </Link>
        </nav>
      )}
    </header>
  );
}
