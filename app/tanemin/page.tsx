import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import FadeIn from '../components/lp/motion/FadeIn';
import Footer from '../components/lp/Footer';

export const metadata: Metadata = {
  title: 'たねみん | TANE PROJECT',
  description:
    'たねみんとは、TANE PROJECTでアイデアという「種」を一緒に育てる仲間のこと。Grow Ideas. Grow Together.',
};

const ROLES = [
  {
    name: 'TANE PROJECT',
    role: 'プロジェクト',
    description: 'アイデアの種を、現実のカタチへ育てる取り組みそのもの。',
  },
  {
    name: 'TANE:i',
    role: 'AIパートナー',
    description: '相談から設計・木取りまで、ものづくりを並走して支える。',
  },
  {
    name: 'たねみん',
    role: 'コミュニティ',
    description: 'アイデアという種を、一緒に育てる仲間たち。',
  },
] as const;

const MOTIFS = [
  { title: '双葉', description: '芽吹いたばかりの、これから伸びていく可能性。' },
  { title: '種', description: 'まだ形になっていない、みんなのアイデア。' },
  { title: '笑顔', description: 'ものづくりを楽しむ、たねみんの表情。' },
  { title: '丸いフォルム・円', description: 'とがらず、誰でも輪に入れるやわらかさ。' },
];

const PALETTE = [
  { name: 'Green', hex: '#6BAA4A', meaning: '成長・自然・芽吹き' },
  { name: 'Brown', hex: '#5A3E1E', meaning: '土・木・あたたかみ' },
  { name: 'Orange', hex: '#F08A2A', meaning: '元気・笑顔・太陽' },
  { name: 'Beige', hex: '#F6EAD1', meaning: 'やさしさ・余白' },
];

export default function TaneminPage() {
  return (
    <main
      className="min-h-screen bg-[#FAF8F4] text-[#1F3028]"
      style={{ fontFamily: 'var(--font-inter), var(--font-noto-jp), sans-serif' }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center px-6 py-8 sm:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#1F3028]/60 transition-colors hover:text-[#1F3028]"
        >
          <span aria-hidden="true">←</span> TANE PROJECT
        </Link>
      </div>

      {/* Hero */}
      <section className="px-6 pb-20 pt-8 text-center sm:pb-28">
        <FadeIn>
          <p className="text-[12px] tracking-[0.4em] text-[#8A8A8A]">Community</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mx-auto mt-10 w-full max-w-[360px] rounded-sm border border-[#1F3028]/10 bg-white p-8 sm:max-w-[420px]">
            <Image
              src="/images/tanemin-logo.jpg"
              alt="たねみんのロゴ。芽が伸びた種のキャラクターを中心に「たねみん・TANE PROJECTの仲間」の文字と「Grow Ideas. Grow Together.」のタグラインが添えられている"
              width={1252}
              height={759}
              className="h-auto w-full"
              priority
            />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <p className="mx-auto mt-12 max-w-xl text-[17px] leading-[2.1] text-[#1F3028]/75">
            たねみんとは、TANE PROJECTでアイデアという
            <br className="hidden sm:block" />
            「種」を一緒に育てる仲間のことです。
          </p>
        </FadeIn>
      </section>

      {/* 役割の整理 */}
      <section className="bg-white px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Roles</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            3つの言葉、3つの役割。
          </h2>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mx-auto mt-16 max-w-[880px] rounded-sm border border-[#1F3028]/10 px-6 py-10 sm:px-10 sm:py-12">
            <div className="text-center">
              <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">{ROLES[0].role}</p>
              <p className="mt-2 text-[22px] font-light tracking-[-0.01em]">{ROLES[0].name}</p>
              <p className="mx-auto mt-3 max-w-sm text-[14px] leading-[1.9] text-[#1F3028]/65">
                {ROLES[0].description}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 border-t border-[#1F3028]/10 pt-10 sm:grid-cols-2 sm:gap-6">
              {ROLES.slice(1).map((item) => (
                <div key={item.name} className="rounded-sm bg-[#FAF8F4] px-6 py-8 text-center">
                  <p className="text-[11px] tracking-[0.3em] text-[#8A8A8A]">{item.role}</p>
                  <p className="mt-2 text-[18px] font-normal tracking-[-0.01em]">{item.name}</p>
                  <p className="mt-3 text-[13px] leading-[1.9] text-[#1F3028]/65">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ロゴ・デザインの紹介 */}
      <section className="px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Design</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            たねみんのかたち。
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[15px] leading-[1.9] text-[#1F3028]/65">
            双葉・種・笑顔・丸いフォルムと円。5つのモチーフが、
            <br className="hidden sm:block" />
            たねみんのやわらかい佇まいをつくっています。
          </p>
        </FadeIn>

        <div className="mx-auto mt-16 grid max-w-[900px] grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {MOTIFS.map((motif, index) => (
            <FadeIn key={motif.title} delay={index * 0.05}>
              <p className="text-[15px] font-normal">{motif.title}</p>
              <p className="mt-2 text-[13px] leading-[1.8] text-[#1F3028]/60">{motif.description}</p>
            </FadeIn>
          ))}
        </div>

        {/* カラーパレット */}
        <FadeIn className="mx-auto mt-24 max-w-[900px] text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Color Palette</p>
        </FadeIn>
        <div className="mx-auto mt-10 grid max-w-[900px] grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {PALETTE.map((color, index) => (
            <FadeIn key={color.hex} delay={index * 0.06}>
              <div className="overflow-hidden rounded-sm border border-[#1F3028]/10">
                <div className="h-24 w-full" style={{ backgroundColor: color.hex }} />
                <div className="bg-white px-4 py-4">
                  <p className="text-[13px] font-medium">{color.name}</p>
                  <p className="mt-0.5 text-[11px] tracking-wide text-[#8A8A8A]">{color.hex}</p>
                  <p className="mt-2 text-[12px] leading-[1.7] text-[#1F3028]/60">{color.meaning}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1F3028] px-6 py-24 text-center text-white sm:py-32">
        <FadeIn>
          <h2 className="text-[clamp(24px,3.5vw,36px)] font-light leading-[1.5] tracking-[-0.02em]">
            あなたの種も、
            <br className="sm:hidden" />
            一緒に育てませんか。
          </h2>
        </FadeIn>
        <FadeIn delay={0.15}>
          {/* TANE:i本体（/app）はベータ版として公開済みのため、CTAから直接遷移できるようにする */}
          <Link
            href="/app"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[14px] font-medium text-[#1F3028] transition-colors hover:bg-white/90"
          >
            TANE:iをはじめる
            <span aria-hidden="true">→</span>
          </Link>
        </FadeIn>
      </section>

      <Footer />
    </main>
  );
}
