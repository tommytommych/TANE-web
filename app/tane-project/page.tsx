import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import FadeIn from '../components/lp/motion/FadeIn';
import Footer from '../components/lp/Footer';

export const metadata: Metadata = {
  title: 'TANE PROJECT | ブランド理念とロゴに込めた想い',
  description:
    'Ideas into Reality. アイデアの種を、カタチに。TANE PROJECTのブランド理念、TANEに込めた4つの意味、ロゴのストーリー。',
};

const CYCLE = ['AIで考える', '設計する', 'DIYで作る', '作品を共有する', '新しい挑戦へつなげる'];

const TANE_MEANINGS = [
  { letter: 'T', word: 'Technology', ja: 'テクノロジー', description: 'AIやデジタル技術を、積極的に取り入れる。' },
  { letter: 'A', word: 'Art', ja: '創造・デザイン', description: 'ものづくりを、表現として楽しむ。' },
  { letter: 'N', word: 'Next', ja: '未来・挑戦', description: '小さな一歩が、次の可能性へつながる。' },
  { letter: 'E', word: 'Evolution', ja: '進化', description: '作るたびに、技術も発想も成長していく。' },
];

const LOGO_PARTS = [
  {
    icon: '🌱',
    title: '中央の芽（TANE）',
    description:
      'ロゴの中心にある芽は、TANE PROJECTの原点です。すべての作品は、小さな「作ってみたい」という気持ちから始まります。この芽は、「挑戦」と「成長」の象徴です。',
  },
  {
    icon: '☀️',
    title: '上の太陽',
    description:
      '太陽は、ひらめきと可能性を表しています。TANE PROJECTが、ものづくりを始める人にとっての“光”となり、一歩踏み出すきっかけになることを願っています。',
  },
  {
    icon: '🏠',
    title: '家のシルエット',
    description:
      '家は、DIYの原点を表しています。DIYは特別な工房だけでなく、自宅やガレージなど、身近な場所から始まります。',
  },
  {
    icon: '🌾',
    title: '土地・大地',
    description:
      '芽が育つ大地は、挑戦できる環境を意味しています。実際に作り、失敗し、改善しながら成長していく。DIYそのものを象徴しています。',
  },
  {
    icon: '🔌',
    title: '左右の回路',
    description:
      '左右に伸びる回路は、AI・デジタル技術・未来のものづくりを表現しています。「伝統的なDIY」と「最新テクノロジー」をつなぐ架け橋という意味があります。',
  },
];

export default function TaneProjectAboutPage() {
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
          <p className="text-[12px] tracking-[0.4em] text-[#8A8A8A]">Ideas into Reality.</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="mx-auto mt-10 w-full max-w-[360px] rounded-sm border border-[#1F3028]/10 bg-white p-8 sm:max-w-[420px]">
            <Image
              src="/images/tane-project-logo.png"
              alt="TANE PROJECTのロゴ。家のシルエットの中に、太陽と回路に見守られながら育つ芽が描かれている"
              width={1536}
              height={1024}
              className="h-auto w-full"
              priority
            />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <h1 className="mx-auto mt-12 max-w-2xl text-[clamp(28px,4.5vw,44px)] font-light leading-[1.5] tracking-[-0.02em]">
            アイデアの種を、カタチに。
          </h1>
        </FadeIn>
        <FadeIn delay={0.3}>
          <p className="mx-auto mt-8 max-w-lg text-[15px] leading-[2] text-[#1F3028]/65">
            思いつきで終わらせない。AIで考え、設計し、DIYで作り、
            <br className="hidden sm:block" />
            作品を共有し、新しい挑戦へつなげる——その循環を生み出します。
          </p>
        </FadeIn>

        <FadeIn delay={0.4}>
          <div className="mx-auto mt-16 flex max-w-4xl flex-wrap items-center justify-center gap-3">
            {CYCLE.map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <div className="min-w-[150px] rounded-full border border-[#1F3028]/12 bg-white px-6 py-3 text-[13px] font-normal">
                  {step}
                </div>
                {index < CYCLE.length - 1 && <span className="text-[#1F3028]/25">→</span>}
              </div>
            ))}
            <span className="text-[#5F8D69]/50" aria-hidden="true">
              ↺
            </span>
          </div>
        </FadeIn>
      </section>

      {/* TANE PROJECTとは */}
      <section className="bg-[#1F3028] px-6 py-24 text-center text-white sm:py-32">
        <FadeIn>
          <p className="text-[12px] tracking-[0.3em] text-white/50">TANE PROJECTとは</p>
          <p className="mx-auto mt-8 max-w-2xl text-[clamp(20px,3vw,28px)] font-light leading-[1.9] tracking-[-0.01em]">
            TANE PROJECTは、DIYのブランドではありません。
            <br />
            小さな種を育て、大きな森へと成長させていくプロジェクトです。
          </p>
        </FadeIn>
        <FadeIn delay={0.15}>
          <p className="mx-auto mt-10 max-w-xl text-[14px] leading-[2] text-white/60">
            一人ひとりの「作ってみたい」という種は小さくても、多くの人が集まり、学び、挑戦することで、
            <br className="hidden sm:block" />
            大きな森へと成長していく。そんな未来を目指しています。
          </p>
        </FadeIn>
      </section>

      {/* TANEに込めた4つの意味 */}
      <section className="bg-white px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Acronym</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            「TANE」に込めた4つの意味。
          </h2>
        </FadeIn>

        <div className="mx-auto mt-16 grid max-w-[960px] grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {TANE_MEANINGS.map((item, index) => (
            <FadeIn key={item.letter} delay={index * 0.08}>
              <div className="h-full rounded-sm bg-[#FAF8F4] px-6 py-8 text-center">
                <span className="text-[32px] font-light text-[#5F8D69]">{item.letter}</span>
                <p className="mt-3 text-[15px] font-medium">{item.word}</p>
                <p className="mt-1 text-[12px] text-[#8A8A8A]">{item.ja}</p>
                <p className="mt-4 text-[13px] leading-[1.8] text-[#1F3028]/65">{item.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ロゴに込められた想い */}
      <section className="px-6 py-24 sm:py-32">
        <FadeIn className="text-center">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Logo Story</p>
          <h2 className="mt-6 text-[clamp(28px,4vw,44px)] font-light leading-[1.4] tracking-[-0.02em]">
            ロゴに込められた想い。
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-[1.9] text-[#1F3028]/65">
            自然な発想を、テクノロジーで育て、現実へ変えていく。
            <br className="hidden sm:block" />
            5つのモチーフに、その想いを込めています。
          </p>
        </FadeIn>

        <div className="mx-auto mt-16 grid max-w-[1000px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {LOGO_PARTS.map((part, index) => (
            <FadeIn key={part.title} delay={index * 0.06}>
              <div className="h-full rounded-sm border border-[#1F3028]/10 bg-white p-8">
                <span className="text-3xl leading-none">{part.icon}</span>
                <h3 className="mt-5 text-[16px] font-medium">{part.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.9] text-[#1F3028]/65">{part.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1F3028] px-6 py-24 text-center text-white sm:py-32">
        <FadeIn>
          <h2 className="text-[clamp(24px,3.5vw,36px)] font-light leading-[1.5] tracking-[-0.02em]">
            あなたの種を、
            <br className="sm:hidden" />
            一緒に育てませんか。
          </h2>
        </FadeIn>
        <FadeIn delay={0.15}>
          <Link
            href="/app"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[14px] font-medium text-[#1F3028] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#FAF8F4]"
          >
            TANE:iをはじめる
          </Link>
        </FadeIn>
      </section>

      <Footer />
    </main>
  );
}
