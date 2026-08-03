'use client';

import Image from 'next/image';
import FadeIn from './motion/FadeIn';

export default function Community() {
  return (
    <section id="community" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
      <div className="mx-auto grid max-w-[1300px] items-center gap-16 lg:grid-cols-2 lg:gap-24">
        <FadeIn className="order-2 lg:order-1">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm lg:aspect-[3/4]">
            {/* TODO: フリー素材の仮画像。後日、コミュニティ活動の実写真に差し替え予定 */}
            <Image
              src="/images/lp-work-family.jpg"
              alt="木製のサイドテーブルに置かれたお茶とカメラ"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="order-1 lg:order-2">
          <p className="text-[12px] tracking-[0.3em] text-[#8A8A8A]">Community</p>
          <h2 className="mt-6 text-[clamp(32px,4.5vw,52px)] font-light leading-[1.3] tracking-[-0.02em] text-[#1F3028]">
            たねみん
          </h2>

          <div className="mt-10 space-y-6 text-[16px] leading-[2] text-[#1F3028]/75">
            <p>
              TANE PROJECTに関わるすべての人を
              <br />
              「たねみん」と呼びます。
            </p>
            <p>子どもたちは「こたね」。</p>
            <p>
              ものづくりを通して、
              <br />
              みんなで成長するコミュニティ。
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
