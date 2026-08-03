'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import RevealText from './motion/RevealText';

// TODO: 実際のブランドムービー素材（種→発芽→木→木材→制作→完成→暮らし の実写・実撮影動画）が
// 用意できたら、背景に敷く演出を検討する
export default function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] px-6 pt-24 text-center">
      {/* 前面：見出し・説明・CTA */}
      <div className="relative z-10 flex flex-col items-center">
        <FadeInSmall>
          <p className="text-[13px] tracking-[0.35em] text-[#8A8A8A]">Ideas into Reality.</p>
        </FadeInSmall>

        <RevealText
          as="h1"
          text={'アイデアの種を、\nカタチに。'}
          className="mt-8 text-[clamp(44px,8vw,108px)] font-light leading-[1.15] tracking-[-0.03em] text-[#1F3028]"
          staggerDelay={0.03}
        />

        <FadeInSmall delay={0.4}>
          <p className="mt-8 max-w-md text-lg leading-loose text-[#1F3028]/70">
            人のひらめきを、
            <br />
            AIとものづくりで現実へ。
          </p>
        </FadeInSmall>

        <FadeInSmall delay={0.55}>
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-[#1F3028] px-8 py-3.5 text-[14px] font-medium text-[#FAF8F4] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5F8D69]"
            >
              TANE:iをはじめる
            </Link>
            <a
              href="#story"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('story')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="inline-flex items-center gap-1.5 text-[14px] font-normal text-[#1F3028]/70 transition-colors hover:text-[#1F3028]"
            >
              ブランドストーリーを見る
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </FadeInSmall>
      </div>
    </section>
  );
}

// Hero内の小要素（タグライン・説明・CTA）を静かにフェードインさせるだけの軽量版
function FadeInSmall({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
