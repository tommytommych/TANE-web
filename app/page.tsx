'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

// TANE PROJECT ランディングページ。TANE:iアプリ本体とは独立した、ブランド訴求用の1枚もの
// マーケティングページ（配色・トーンは意図的にアプリ本体のtanei-*トークンと分離している）。

const NAV_ITEMS = [
  { id: 'story', label: '物語' },
  { id: 'flow', label: '流れ' },
  { id: 'works', label: '作品' },
  { id: 'tane-i', label: 'TANE:i' },
  { id: 'future', label: '未来' },
] as const;

const FLOW_STEPS = [
  { icon: '💬', title: '相談', desc: '頭の中にある想いを整理する' },
  { icon: '✨', title: '完成イメージ', desc: '未来の形を見えるようにする' },
  { icon: '📐', title: '設計', desc: '作れる形へ落とし込む' },
  { icon: '🔨', title: '制作', desc: 'アイデアを現実へ変える' },
];

// TODO: いずれもフリー素材の仮画像。後日、実際の制作事例の写真に差し替え予定
const WORKS = [
  {
    title: '暮らしを変える棚',
    desc: '空間や生活に合わせて考えた、世界にひとつの収納。',
    image: '/images/lp-work-shelf.jpg',
    alt: '木の棚に並べられたヴィンテージカメラ',
  },
  {
    title: '作業を楽しむ机',
    desc: '作る時間そのものを楽しむための場所。',
    image: '/images/lp-work-desk.jpg',
    alt: 'モニターやタブレットが整然と並んだ俯瞰のデスク周り',
  },
  {
    title: '家族で使う家具',
    desc: '毎日の思い出と一緒に育つ作品。',
    image: '/images/lp-work-family.jpg',
    alt: '木製のサイドテーブルに置かれたお茶とカメラ',
  },
];

const TANEI_FLOW = ['相談', '完成イメージ', '設計', '木取り', '制作'];

const TANEI_FEATURES = [
  { icon: '💬', label: 'アイデア相談' },
  { icon: '🖼️', label: '完成イメージ' },
  { icon: '📐', label: '設計図' },
  { icon: '📏', label: '木取り図' },
  { icon: '📋', label: '材料リスト' },
];

const FUTURE_LINKS: { icon: string; label: string; desc: string; href?: string }[] = [
  { icon: '🌱', label: 'TANE:i', desc: 'アイデアをカタチにするAIパートナー（近日公開）' },
  { icon: '🪑', label: '作品', desc: 'ユーザーの制作事例（近日公開）' },
  { icon: '📚', label: '学び', desc: '木工・DIYの知識（近日公開）' },
  { icon: '🤝', label: 'つながり', desc: 'コミュニティ（近日公開）' },
];

// TODO: 正式に運用するLINE公式アカウント等のURLが決まり次第、ここを差し替える
const CONTACT_HREF = 'https://line.me/R/ti/p/@your_line_id';

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12px] tracking-[0.3em] text-[#5B655F] text-center">{children}</p>;
}

export default function LpPage() {
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
    <main
      className="min-h-screen bg-[#F7F4EE] text-[#1D1D1F]"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif' }}
    >
      {/* ================= HEADER ================= */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          isScrolled || isMobileMenuOpen
            ? 'bg-[#F7F4EE]/90 backdrop-blur-md border-b border-[#1F3028]/10 shadow-[0_1px_0_rgba(31,48,40,0.04)]'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 sm:px-10 h-[72px]">
          <a href="#" className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-[0.12em] text-[#1F3028]">🌱 TANE PROJECT</span>
            <span className="text-[9px] tracking-[0.25em] text-[#7A867C]">Ideas into Reality.</span>
          </a>

          <nav className="hidden md:flex items-center gap-9">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className={`relative pb-1 text-[13px] font-medium transition-colors ${
                  activeSection === item.id ? 'text-[#1F3028]' : 'text-[#7A867C] hover:text-[#1F3028]'
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-0 -bottom-0.5 h-[1.5px] origin-left bg-[#1F3028] transition-transform duration-300 ${
                    activeSection === item.id ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="md:hidden flex h-9 w-9 flex-col items-center justify-center gap-1.5"
            aria-label={isMobileMenuOpen ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={isMobileMenuOpen}
          >
            <span
              className={`block h-[1.5px] w-5 bg-[#1F3028] transition-transform duration-200 ${
                isMobileMenuOpen ? 'translate-y-[6.5px] rotate-45' : ''
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-[#1F3028] transition-opacity duration-200 ${
                isMobileMenuOpen ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-[#1F3028] transition-transform duration-200 ${
                isMobileMenuOpen ? '-translate-y-[6.5px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>

        {isMobileMenuOpen && (
          <nav className="md:hidden border-t border-[#1F3028]/10 bg-[#F7F4EE]/95 px-6 py-2 backdrop-blur-md">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className={`block border-b border-[#1F3028]/5 py-3.5 text-base font-medium last:border-0 ${
                  activeSection === item.id ? 'text-[#1F3028]' : 'text-[#55645B]'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* ================= HERO ================= */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 pb-20 pt-32 text-center">
        <div className="relative mb-14 aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#1F3028]/10 sm:aspect-[16/9]">
          {/* TODO: フリー素材の仮画像。後日、実際の工房写真に差し替え予定 */}
          <Image
            src="/images/lp-hero.jpg"
            alt="木製デスクに置かれたノートパソコンとメガネ、マウス"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 900px"
            className="object-cover"
          />
        </div>

        <p className="text-[13px] tracking-[0.35em] text-[#7A867C]">Ideas into Reality.</p>

        <h1 className="my-8 text-[clamp(42px,7vw,96px)] font-light leading-[1.15] tracking-[-0.03em]">
          アイデアの種を、
          <br />
          カタチに。
        </h1>

        <p className="max-w-md text-lg leading-loose text-[#4B564E]">
          TANE PROJECTは、
          <br />
          DIYを起点に、
          <br />
          アイデアを現実へ変えるブランドです。
        </p>

        <a
          href="#flow"
          onClick={(e) => handleNavClick(e, 'flow')}
          className="group mt-16 inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.1em] text-[#1F3028]"
        >
          流れを見る
          <span className="inline-block transition-transform duration-300 group-hover:translate-y-1">↓</span>
        </a>
      </section>

      {/* ================= STORY ================= */}
      <section id="story" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
        <div className="mx-auto max-w-[800px]">
          <SectionEyebrow>TANE PROJECT</SectionEyebrow>

          <h2 className="mt-5 text-center text-[clamp(32px,5vw,55px)] font-light leading-[1.4]">
            小さなひらめきを、
            <br />
            未来のカタチへ。
          </h2>

          <p className="mt-10 text-[17px] leading-[2.2] text-[#4B564E]">
            人は毎日の暮らしの中で、ふとアイデアを思いつきます。
            <br />
            <br />
            「こんな棚があったら便利なのに。」
            <br />
            「もっと簡単に作れたらいいのに。」
            <br />
            <br />
            その小さなひらめきは、まだ形になっていない種。
            <br />
            <br />
            考え、設計し、作る。
            <br />
            その過程を通して、新しい価値へ育てていきます。
          </p>
        </div>
      </section>

      {/* ================= STORY MESSAGE ================= */}
      <section className="relative px-6 py-28 text-center sm:py-32">
        <div className="mx-auto max-w-2xl">
          <span className="text-4xl text-[#1F3028]/15">”</span>
          <h2 className="text-[clamp(28px,4vw,44px)] font-light leading-[1.5]">
            TANE PROJECTは、
            <br />
            アイデアを育てる場所。
          </h2>
          <p className="mt-8 text-[17px] leading-[2] text-[#4B564E]">
            一人ひとりの挑戦が、
            <br />
            誰かの新しい種になる。
          </p>
        </div>
      </section>

      {/* ================= FLOW ================= */}
      <section id="flow" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
        <SectionEyebrow>Flow</SectionEyebrow>
        <h2 className="mt-5 text-center text-[clamp(30px,4.5vw,46px)] font-light leading-[1.3]">
          アイデアが、
          <br className="sm:hidden" />
          カタチになるまで。
        </h2>

        <div className="relative mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_STEPS.map((item, index) => (
            <div
              key={item.title}
              className="group relative rounded-[24px] border border-[#1F3028]/8 bg-[#F7F4EE] p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(31,48,40,0.08)]"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-[11px] font-medium tracking-[0.15em] text-[#7A867C]">
                  STEP 0{index + 1}
                </span>
              </div>
              <h3 className="text-[19px] font-medium">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#55645B]">{item.desc}</p>

              {index < FLOW_STEPS.length - 1 && (
                <span className="pointer-events-none absolute right-[-14px] top-1/2 hidden -translate-y-1/2 text-lg text-[#1F3028]/25 lg:block">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ================= WORKS ================= */}
      <section id="works" className="scroll-mt-24 bg-[#F7F4EE] px-6 py-32 sm:py-40">
        <div className="mx-auto max-w-5xl">
          <SectionEyebrow>作品</SectionEyebrow>
          <h2 className="mt-5 text-center text-[clamp(30px,4.5vw,46px)] font-light leading-[1.4]">
            生まれたアイデアが、
            <br />
            暮らしを変える。
          </h2>

          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {WORKS.map((item) => (
              <div
                key={item.title}
                className="group overflow-hidden rounded-[24px] bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(31,48,40,0.1)]"
              >
                <div className="relative h-56 w-full overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-8">
                  <h3 className="text-[19px] font-medium">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.8] text-[#55645B]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TANE:i ================= */}
      <section id="tane-i" className="scroll-mt-24 bg-[#1F3028] px-6 py-32 text-center text-white sm:py-40">
        <p className="text-[12px] tracking-[0.4em] text-white/60">TANE:i</p>

        <h2 className="my-5 text-[clamp(64px,10vw,130px)] font-light leading-none tracking-[-0.04em]">TANE:i</h2>

        <p className="mx-auto max-w-lg text-[20px] leading-[2] text-white/90">
          あなたの中にある、
          <br />
          まだ見えないアイデアを、
          <br />
          一緒に育てるパートナー。
        </p>

        {/* TANE:i FLOW */}
        <div className="mx-auto mt-16 flex max-w-4xl flex-wrap items-center justify-center gap-3">
          {TANEI_FLOW.map((item, index) => (
            <div key={item} className="flex items-center gap-3">
              <div className="min-w-[110px] rounded-[16px] border border-white/25 bg-white/[0.04] px-6 py-5 text-[15px] font-medium transition-colors hover:border-white/50 hover:bg-white/[0.08]">
                {item}
              </div>
              {index < TANEI_FLOW.length - 1 && <span className="text-lg text-white/40">→</span>}
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {TANEI_FEATURES.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-2 rounded-[16px] bg-white/[0.06] px-4 py-6 text-[14px] transition-colors hover:bg-white/[0.1]"
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

        <div className="mt-16 inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3.5 text-[14px] font-semibold tracking-[0.05em] text-white/70">
          近日公開
        </div>
      </section>

      {/* ================= FUTURE / CTA ================= */}
      <section id="future" className="scroll-mt-24 bg-white px-6 py-32 text-center sm:py-40">
        <h2 className="text-[clamp(32px,5vw,55px)] font-light leading-[1.4]">次のアイデアの種へ。</h2>

        <p className="mx-auto mt-8 max-w-md text-[17px] leading-[2] text-[#4B564E]">
          TANE PROJECTは、
          <br />
          ものづくりを通じて、
          <br />
          新しい挑戦を育てていきます。
        </p>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {FUTURE_LINKS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="group flex flex-col items-center gap-2 rounded-[20px] border border-[#1F3028]/8 bg-[#F7F4EE] px-5 py-8 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#1F3028]/20 hover:shadow-[0_16px_36px_rgba(31,48,40,0.08)]"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="mt-1 text-[15px] font-semibold text-[#1F3028]">{item.label}</span>
                <span className="text-[11px] leading-snug text-[#7A867C]">{item.desc}</span>
              </Link>
            ) : (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 rounded-[20px] border border-[#1F3028]/8 bg-[#F7F4EE] px-5 py-8 text-left opacity-60"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="mt-1 text-[15px] font-semibold text-[#1F3028]">{item.label}</span>
                <span className="text-[11px] leading-snug text-[#7A867C]">{item.desc}</span>
              </div>
            )
          )}
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-[#F7F4EE] px-6 py-20 text-center text-[#7A867C]">
        <a
          href={CONTACT_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#1F3028]/15 px-5 py-2.5 text-[13px] font-medium text-[#1F3028] transition-colors hover:bg-[#1F3028] hover:text-white"
        >
          <span>💬</span> ご意見、リクエストはこちらから
        </a>

        <div className="mt-14 text-[16px] font-semibold tracking-[0.15em] text-[#1F3028]">🌱 TANE PROJECT</div>
        <p className="mt-2 text-[12px] tracking-[0.2em]">Ideas into Reality.</p>
        <p className="mt-8 text-[11px]">© 2026 TANE PROJECT</p>
      </footer>
    </main>
  );
}
