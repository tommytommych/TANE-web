import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import FadeIn from '../components/lp/motion/FadeIn';
import Footer from '../components/lp/Footer';

export const metadata: Metadata = {
  title: 'TANE:i | TANE PROJECT',
  description:
    'アイデアの種を、カタチに。思いつきで終わらせない。AI×DIY設計サポート「TANE:i」のコンセプト紹介。',
};

const CYCLE = [
  'AIが設計をサポート',
  'DIYで形にする',
  '暮らしの中で使う',
  '新しいアイデアが生まれる',
];

const I_MEANINGS = [
  { word: 'Idea', ja: 'アイデア', description: '頭の中にある、まだ形になっていない想い。' },
  { word: 'Intelligence', ja: 'AI', description: '知恵を貸してくれる、頼れるパートナー。' },
  { word: 'Imagine', ja: '想像する', description: '完成した姿を、思い描く力。' },
  { word: 'Innovation', ja: '新しい価値', description: '世界にひとつの「なるほど」を生み出す。' },
];

const LOGO_PARTS = [
  {
    icon: '🌱',
    title: 'Sprout（芽）',
    description: 'すべての始まり。「やってみたい」という気持ち。',
  },
  {
    icon: '🏠',
    title: 'House（家）',
    description: '暮らしを象徴し、快適で楽しい暮らしを生み出す場所。',
  },
  {
    icon: '🌿',
    title: '自然 × テクノロジー',
    description:
      '直線（家＝人工物）と曲線（芽＝自然）の共存。AIは主役ではなく、ものづくりを楽しむ人のパートナー。',
  },
];

const PALETTE = [
  { name: 'Brown', hex: '#723F15', meaning: '木材・大地・クラフトマンシップ・手仕事の価値' },
  { name: 'Green', hex: '#46572F', meaning: '芽吹き・成長・未来' },
];

export default function TaneiAboutPage() {
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
          <p className="text-[12px] tracking-[0.4em] text-[#8A8A8A]">AI × DIY Design Partner</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mx-auto mt-10 w-full max-w-[320px] rounded-sm border border-[#1F3028]/10 bg-white p-8 sm:max-w-[360px]">
            <Image
              src="/images/tanei-logo.png"
              alt="TANE:iのロゴ。家のシルエットの中から双葉が伸びる意匠と、「TANE:i アイデアの種を、カタチに。DIY DESIGN PARTNER」の文字"
              width={1254}
              height={1254}
              className="h-auto w-full"
              priority
            />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <h1 className="mx-auto mt-12 max-w-2xl text-[clamp(28px,4.5vw,44px)] font-light leading-[1.5] tracking-[-0.02em]">
            アイデアの種を、カタチに。
            <br />
            思いつきで終わらせない。
          </h1>
        </FadeIn>
        <FadeIn delay={0.3}>
          <p className="mx-auto mt-8 max-w-lg text-[15px] leading-[2] text-[#1F3028]/65">
            AIが設計をサポートし、DIYで形にし、暮らしの中で使い、
            <br className="hidden sm:block" />
            さらに新しいアイデアが生まれる。TANE:iは、その循環を生み出します。
          </p>
        </FadeIn>

        <FadeIn delay={0.4}>
          <div className="mx-auto mt-16 flex max-w-4xl flex-wrap items-center justify-center gap-3">
            {CYCLE.map((step) => (
              <div key={step} className="flex items-center gap-3">
                <div className="min-w-[150px] rounded-full border border-[#1F3028]/12 bg-white px-6 py-3 text-[13px] font-normal">
                  {step}
                </div>
                <span className="text-[#1F3028]/25">→</span>
              </div>
            ))}
            <div className="min-w-[150px] rounded-full border border-[#5F8D69]/30 bg-[#5F8D69]/10 px-6 py-3 text-[13px] font-normal text-[#5F8D69]">
              <span aria-hidden="true">↺</span> また、新しい種へ
            </div>
          </div>
        </FadeIn>
      </section>

      {/* :iに込めた意味 */}
      <section className="bg-white px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Meaning</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            「:i」に込めた意味。
          </h2>
        </FadeIn>

        <div className="mx-auto mt-16 grid max-w-[960px] grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {I_MEANINGS.map((item, index) => (
            <FadeIn key={item.word} delay={index * 0.08}>
              <div className="h-full rounded-sm bg-[#FAF8F4] px-8 py-8">
                <span className="text-[28px] font-light italic text-[#5F8D69]">i</span>
                <p className="mt-3 text-[18px] font-normal tracking-[-0.01em]">
                  {item.word}
                  <span className="ml-2 text-[13px] font-normal text-[#8A8A8A]">{item.ja}</span>
                </p>
                <p className="mt-3 text-[14px] leading-[1.9] text-[#1F3028]/65">{item.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ロゴに込められた思想 */}
      <section className="px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Design</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            ロゴに込められた思想。
          </h2>
        </FadeIn>

        <div className="mx-auto mt-16 grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-3">
          {LOGO_PARTS.map((part, index) => (
            <FadeIn key={part.title} delay={index * 0.08}>
              <div className="h-full rounded-sm border border-[#1F3028]/10 bg-white p-8">
                <span className="text-3xl leading-none">{part.icon}</span>
                <h3 className="mt-5 text-[16px] font-medium">{part.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.9] text-[#1F3028]/65">{part.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* カラーの意味 */}
        <FadeIn className="mx-auto mt-24 max-w-[900px] text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Color</p>
        </FadeIn>
        <div className="mx-auto mt-10 grid max-w-[640px] grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {PALETTE.map((color, index) => (
            <FadeIn key={color.hex} delay={index * 0.08}>
              <div className="overflow-hidden rounded-sm border border-[#1F3028]/10">
                <div className="h-24 w-full" style={{ backgroundColor: color.hex }} />
                <div className="bg-white px-6 py-6">
                  <p className="text-[14px] font-medium">{color.name}</p>
                  <p className="mt-0.5 text-[11px] tracking-wide text-[#8A8A8A]">{color.hex}</p>
                  <p className="mt-3 text-[13px] leading-[1.8] text-[#1F3028]/65">{color.meaning}</p>
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
            あなたのアイデアの種を、
            <br className="sm:hidden" />
            一緒にカタチにしましょう。
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
