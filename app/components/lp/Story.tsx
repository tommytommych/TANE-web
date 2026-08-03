'use client';

import Image from 'next/image';
import FadeIn from './motion/FadeIn';

export default function Story() {
  return (
    <section id="story" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
      <div className="mx-auto grid max-w-[1300px] items-center gap-16 lg:grid-cols-2 lg:gap-24">
        <FadeIn>
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Ideas into Reality.</p>
          <h2 className="mt-6 text-[clamp(32px,4.5vw,52px)] font-light leading-[1.35] tracking-[-0.02em] text-[#1F3028]">
            アイデアの種を、
            <br />
            カタチに。
          </h2>

          <div className="mt-10 space-y-6 text-[16px] leading-[2] text-[#1F3028]/75">
            <p>
              人は毎日の暮らしの中で、
              <br />
              ふとした瞬間にアイデアを思いつきます。
            </p>
            <p>
              「こんな棚があったら便利なのに。」
              <br />
              「もっと簡単に作れたらいいのに。」
              <br />
              「AIが手伝ってくれたら。」
            </p>
            <p>
              その小さなひらめきは、
              <br />
              まだ形になっていない&ldquo;種&rdquo;です。
            </p>
            <p>
              考え、設計し、作り、失敗し、
              <br />
              また挑戦する。
            </p>
            <p>
              その積み重ねが
              <br />
              作品になり、技術になり、笑顔になり、
              <br />
              また新しい種になります。
            </p>
            <p className="text-[#1F3028]">
              TANE PROJECTは
              <br />
              その種を育てる場所です。
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} scale={0.96}>
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
