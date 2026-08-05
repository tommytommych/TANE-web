'use client';

import FadeIn from './motion/FadeIn';

const FLOW_STEPS = [
  '相談',
  '完成イメージ',
  '設計図',
  '木取り図',
  '材料リスト',
  '制作',
  '完成',
  '共有',
];

export default function Flow() {
  return (
    <section id="flow" className="scroll-mt-24 bg-white px-6 py-32 sm:py-40">
      <FadeIn>
        <p className="text-center text-[12px] tracking-[0.3em] text-[#8A8A8A]">Flow</p>
        <h2 className="mt-6 text-center text-[clamp(30px,4.5vw,48px)] font-light leading-[1.3] tracking-[-0.02em] text-[#1F3028]">
          TANE:iを使うと、
          <br className="sm:hidden" />
          こんな流れで進みます。
        </h2>
      </FadeIn>

      <div className="mx-auto mt-24 max-w-3xl">
        {FLOW_STEPS.map((step, index) => (
          <FadeIn key={step} delay={index * 0.04} y={32}>
            <div className="group flex items-baseline gap-8 border-b border-[#1F3028]/8 py-8 first:pt-0 last:border-0">
              <span className="text-[13px] tabular-nums tracking-widest text-[#8A8A8A]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[clamp(24px,3.5vw,38px)] font-light text-[#1F3028] transition-colors duration-300 group-hover:text-[#5F8D69]">
                {step}
              </span>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
