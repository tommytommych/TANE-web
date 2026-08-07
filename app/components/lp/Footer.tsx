'use client';

import FadeIn from './motion/FadeIn';

const CONTACT_HREF = 'https://line.me/R/ti/p/@mdo9046l';
const SOCIAL_LINKS = [
  { label: 'YouTube', href: 'https://www.youtube.com/@tomishin_channel_DIY', icon: YoutubeIcon },
  { label: 'Instagram', href: 'https://www.instagram.com/__tomishin__diy/', icon: InstagramIcon },
  { label: 'X', href: 'https://x.com/tommy_diy2025', icon: XIcon },
];

const LEGAL_LINKS = [
  { label: 'お問い合わせ', href: CONTACT_HREF, external: true },
  { label: '利用規約', href: '#', external: false },
  { label: 'プライバシーポリシー', href: '#', external: false },
];

export default function Footer() {
  return (
    <footer className="bg-white px-6 py-28 text-center text-[#8A8A8A]">
      <FadeIn>
        <div className="inline-grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
          <span className="text-xl leading-none">🌱</span>
          <span className="col-start-2 text-[16px] font-medium tracking-[0.12em] text-[#1F3028]">
            TANE PROJECT
          </span>
          <span className="col-start-2 text-[12px] tracking-[0.18em]">Ideas into Reality.</span>
          <span className="col-start-2 mt-1 text-[13px] text-[#1F3028]/60">アイデアの種を、カタチに。</span>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="mt-14 flex items-center justify-center gap-6">
          {SOCIAL_LINKS.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              className="text-[#1F3028]/50 transition-colors hover:text-[#5F8D69]"
            >
              <social.icon />
            </a>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.15}>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px]">
          {LEGAL_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[#1F3028]"
              >
                {link.label}
              </a>
            ) : (
              <a key={link.label} href={link.href} className="transition-colors hover:text-[#1F3028]">
                {link.label}
              </a>
            )
          )}
        </div>
      </FadeIn>

      <p className="mt-14 text-[11px] tracking-[0.05em]">© 2026 TANE PROJECT</p>
    </footer>
  );
}

// ブランドロゴを持つ主要SNSは商標保護のため一般的なアイコンライブラリに含まれないことが多く、
// ここでは最小限のシンプルな輪郭のみをその場で描画する（lucide-reactは汎用UIアイコン用に温存）
function YoutubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9.5v5l4.5-2.5-4.5-2.5z" fill="currentColor" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l7.5 9.2L3.2 21H6l6-6.8L17 21h4l-8-9.8L20.5 3H18l-5.6 6.3L7 3H3z"
        fill="currentColor"
      />
    </svg>
  );
}
