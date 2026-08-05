'use client';

import Image from 'next/image';
import FadeIn from './motion/FadeIn';

const TANE_MEANINGS = [
  { letter: 'T', word: 'Technology', ja: 'テクノロジー' },
  { letter: 'A', word: 'Art', ja: '創造・デザイン' },
  { letter: 'N', word: 'Next', ja: '未来・挑戦' },
  { letter: 'E', word: 'Evolution', ja: '進化' },
];

export default function Story() {
  return (
    <section id="story" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
      <div className="mx-auto grid max-w-[1300px] items-start gap-16 lg:grid-cols-2 lg:gap-24">
        <FadeIn>
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Ideas into Reality.</p>
          <h2 className="mt-6 text-[clamp(32px,4.5vw,52px)] font-light leading-[1.35] tracking-[-0.02em] text-[#1F3028]">
            アイデアの種を、
            <br />
            カタチに。
          </h2>

          <div className="mt-10 space-y-6 text-[16px] leading-[2] text-[#1F3028]/75">
            <p>DIYを続けていると、作りたいものや挑戦したいことが次々と生まれてきます。</p>
            <p>
              「こんな家具があったら便利だな。」
              <br />
              「もっと簡単に設計できないかな。」
              <br />
              「AIを使えば、DIYはもっと楽しくなるかもしれない。」
            </p>
            <p>そんな小さなひらめきやアイデアは、すべて&ldquo;種&rdquo;だと思っています。</p>
            <p>
              種は、そのままでは何も起こりません。
              <br />
              土に植え、水をあげ、育てることで、やがて大きな花や木になります。
            </p>
            <p>
              DIYも同じです。
              <br />
              一枚の木材から家具が生まれるように、一つのアイデアから新しい作品や、新しい技術、新しいコミュニティが生まれていきます。
            </p>
            <p className="text-[#1F3028]">
              だから、このプロジェクトを
              <br />
              「TANE PROJECT」と名付けました。
            </p>
          </div>

          <div className="mt-14 space-y-6 border-t border-[#1F3028]/8 pt-14 text-[16px] leading-[2] text-[#1F3028]/75">
            <p>
              TANE PROJECTは、DIYだけのプロジェクトではありません。
              <br />
              AI、ものづくり、デジタルファブリケーション、クリエイター同士のつながりなど、さまざまな&ldquo;種&rdquo;を育てながら、新しい価値を生み出していくプロジェクトです。
            </p>
            <p>そして、その中心にあるのは、いつもDIYです。</p>
            <p>
              作ることをもっと身近に。
              <br />
              作ることをもっと楽しく。
              <br />
              作ることをもっと自由に。
            </p>
            <p className="text-[#1F3028]">
              一人ひとりの「作ってみたい」という種を、一緒に育てていく。
              <br />
              それが、TANE PROJECTです。
            </p>
          </div>

          <FadeIn delay={0.1} className="mt-14 border-t border-[#1F3028]/8 pt-10">
            <p className="text-[13px] leading-[1.9] text-[#1F3028]/60">
              &ldquo;TANE&rdquo;には、もうひとつの意味も込めています。
            </p>
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {TANE_MEANINGS.map((item) => (
                <div key={item.letter}>
                  <span className="text-[28px] font-light text-[#5F8D69]">{item.letter}</span>
                  <p className="mt-1 text-[13px] font-medium text-[#1F3028]">{item.word}</p>
                  <p className="text-[12px] text-[#1F3028]/50">{item.ja}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </FadeIn>

        <FadeIn delay={0.15} scale={0.96} className="lg:sticky lg:top-32">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm lg:aspect-[3/4]">
            {/* TODO: フリー素材の仮画像。後日、とみしんの制作風景写真に差し替え予定 */}
            <Image
              src="/images/lp-craft-tools.jpg"
              alt="木の作業台に並べられた金槌やメジャーなどの手道具"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
