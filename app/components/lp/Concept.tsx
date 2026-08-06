'use client';

import Image from 'next/image';
import FadeIn from './motion/FadeIn';

const LOGO_PARTS = [
  {
    icon: '🌱',
    title: '中央の芽（TANE）',
    description:
      'ロゴの中心にある芽は、TANE PROJECTの原点です。すべての作品は、小さな「作ってみたい」という気持ちから始まります。その小さな種が、DIY・AI・技術・仲間との出会いによって成長し、新しい価値を生み出していく。この芽は、「挑戦」と「成長」の象徴です。',
  },
  {
    icon: '☀️',
    title: '上の太陽',
    description:
      '太陽は、ひらめきと可能性を表しています。アイデアは、環境や経験、人との出会いによって大きく育ちます。TANE PROJECTが、ものづくりを始める人にとっての“光”となり、一歩踏み出すきっかけになることを願っています。',
  },
  {
    icon: '🏠',
    title: '家のシルエット',
    description:
      '家は、DIYの原点を表しています。DIYは特別な工房だけでなく、自宅やガレージ、庭など、身近な場所から始まります。「暮らしを、自分の手でもっと楽しくする。」そんな想いを家の形に込めています。',
  },
  {
    icon: '🌾',
    title: '土地・大地',
    description:
      '芽が育つ大地は、挑戦できる環境を意味しています。アイデアだけでは形になりません。実際に作り、失敗し、改善しながら成長していく。DIYそのものを象徴しています。',
  },
  {
    icon: '🔌',
    title: '左右の回路',
    description:
      '左右に伸びる回路は、AI・デジタル技術・未来のものづくりを表現しています。TANE PROJECTでは、木工だけでなく、AI・デジタルファブリケーション・設計支援・クリエイターとの共創など、新しい技術も積極的に取り入れていきます。「伝統的なDIY」と「最新テクノロジー」をつなぐ架け橋という意味があります。',
  },
  {
    icon: '🌎',
    title: '全体のデザイン',
    description:
      '自然（芽・太陽・大地）と、テクノロジー（回路）が、一つのロゴの中で融合しています。これは「自然な発想を、テクノロジーで育て、現実へ変えていく。」というTANE PROJECTそのものを表しています。',
  },
];

const PHILOSOPHY_STEPS = ['AIで考える', '設計する', 'DIYで作る', '作品を共有する', '新しい挑戦へつなげる'];

export default function Concept() {
  return (
    <section id="concept" className="scroll-mt-24 bg-[#FAF8F4] px-6 py-32 sm:py-40">
      <div className="mx-auto max-w-[1100px]">
        <FadeIn>
          <div className="mx-auto w-full max-w-[320px] rounded-sm border border-[#1F3028]/10 bg-white p-8 sm:max-w-[380px]">
            <Image
              src="/images/tane-project-logo.png"
              alt="TANE PROJECTのロゴ。家のシルエットの中に、太陽と回路に見守られながら育つ芽が描かれている"
              width={1536}
              height={1024}
              className="h-auto w-full"
            />
          </div>

          <p className="mt-16 text-center text-[12px] tracking-[0.3em] text-[#8A8A8A]">Concept</p>
          <h2 className="mt-6 text-center text-[clamp(30px,4.5vw,48px)] font-light leading-[1.4] tracking-[-0.02em] text-[#1F3028]">
            ロゴに込めた想い
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-center text-[16px] leading-[2] text-[#1F3028]/75">
            このロゴは、「アイデアという小さな種を、ものづくりの力で育て、未来へつなげる」という想いを表現しています。
          </p>
        </FadeIn>

        <div className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {LOGO_PARTS.map((part, index) => (
            <FadeIn key={part.title} delay={index * 0.05}>
              <div className="h-full rounded-sm border border-[#1F3028]/10 bg-white p-8">
                <span className="text-3xl leading-none">{part.icon}</span>
                <h3 className="mt-5 text-[17px] font-medium text-[#1F3028]">{part.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.9] text-[#1F3028]/65">{part.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.1}>
          <div className="mx-auto mt-24 max-w-2xl border-t border-[#1F3028]/8 pt-20 text-center">
            <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">理念</p>
            <h3 className="mt-6 text-[clamp(24px,3.5vw,34px)] font-light tracking-[-0.02em] text-[#1F3028]">
              Ideas into Reality.
            </h3>
            <p className="mt-8 text-[16px] leading-[2] text-[#1F3028]/75">
              この言葉は、「アイデアを現実へ。」というTANE PROJECTの理念です。
              <br />
              思いつくだけで終わらせず——
            </p>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-[13px] text-[#1F3028]">
              {PHILOSOPHY_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="rounded-full border border-[#1F3028]/15 px-4 py-2">{step}</span>
                  {index < PHILOSOPHY_STEPS.length - 1 && (
                    <span className="text-[#1F3028]/25" aria-hidden="true">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-10 text-[16px] leading-[2] text-[#1F3028]/75">
              そのすべてを支えるプロジェクトでありたいという想いを込めています。
            </p>

            <p className="mt-14 text-[16px] leading-[2] text-[#1F3028]/75">
              TANE PROJECTは、DIYのブランドではありません。
              <br />
              「作ってみたい」という小さな種を育て、AIやテクノロジーの力も活用しながら、アイデアを現実に変えていくプロジェクトです。
              <br />
              一人では小さな種でも、多くの人が集まり、学び、挑戦することで、大きな森へと成長していく。
              <br />
              そんな未来を目指して、このロゴはデザインされています。
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
