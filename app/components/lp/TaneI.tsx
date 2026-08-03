'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import FadeIn from './motion/FadeIn';

const STEPS = ['相談', '完成イメージ', '設計', '木取り図', 'PDF'];

// このセクションはbodyより背が高く(300vh)、内側をstickyにすることで
// 「スクロールするとステップが1つずつ進む」Apple風の演出を作っている
export default function TaneI() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const index = Math.min(STEPS.length - 1, Math.floor(latest * STEPS.length));
    setActiveStep(index);
  });

  return (
    <section ref={sectionRef} id="tane-i" className="scroll-mt-24 relative bg-[#1F3028]" style={{ height: '280vh' }}>
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6 text-center text-white">
        <FadeIn>
          <p className="text-[12px] tracking-[0.4em] text-white/50">TANE:i</p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <h2 className="my-6 text-[clamp(64px,12vw,160px)] font-light leading-none tracking-[-0.04em]">TANE:i</h2>
        </FadeIn>

        <FadeIn delay={0.2}>
          <p className="mx-auto max-w-lg text-[18px] leading-[2] text-white/80">
            あなたの「作りたい」を、
            <br />
            完成まで導くAIパートナー。
          </p>
        </FadeIn>

        <div className="mt-16 flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-3">
              <motion.div
                animate={{
                  opacity: index <= activeStep ? 1 : 0.3,
                  scale: index === activeStep ? 1.06 : 1,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={`min-w-[110px] rounded-full border px-6 py-3 text-[14px] font-normal transition-colors duration-300 ${
                  index === activeStep
                    ? 'border-[#5F8D69] bg-[#5F8D69]/15'
                    : 'border-white/20 bg-white/[0.02]'
                }`}
              >
                {step}
              </motion.div>
              {index < STEPS.length - 1 && <span className="text-white/25">→</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
