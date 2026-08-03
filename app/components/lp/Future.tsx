'use client';

import FadeIn from './motion/FadeIn';

const ROADMAP = ['TANE:i', 'DIY AI', 'Community', 'Education', 'Original Product', 'Digital Fabrication', 'Global'];

export default function Future() {
  return (
    <section id="future" className="scroll-mt-24 bg-[#FAF8F4] px-6 py-32 sm:py-40">
      <FadeIn>
        <p className="text-center text-[12px] tracking-[0.3em] text-[#8A8A8A]">2026</p>
        <h2 className="mt-6 text-center text-[clamp(32px,4.5vw,52px)] font-light leading-[1.4] tracking-[-0.02em] text-[#1F3028]">
          これから育つ、
          <br />
          新しい種たち。
        </h2>
      </FadeIn>

      <div className="mx-auto mt-24 max-w-2xl">
        <div className="relative pl-8">
          <div className="absolute left-[3px] top-2 bottom-2 w-px bg-[#1F3028]/12" aria-hidden="true" />
          {ROADMAP.map((item, index) => (
            <FadeIn key={item} delay={index * 0.05} y={20}>
              <div className="relative flex items-center gap-6 py-6">
                <span
                  className={`absolute -left-8 h-1.5 w-1.5 rounded-full ${
                    index === 0 ? 'bg-[#5F8D69]' : 'bg-[#1F3028]/30'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-[13px] tabular-nums text-[#8A8A8A]">{index + 1}</span>
                <span className="text-[clamp(20px,3vw,28px)] font-light text-[#1F3028]">{item}</span>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
