'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import RevealText from './motion/RevealText';

// TODO: 将来的に「種→発芽→木→木材→制作→完成→暮らし」を通しで撮影した
// ブランドムービーが用意できたら、この芽の動画と差し替える
export default function Hero() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] px-6 pt-24 text-center">
      {/* 背景動画：土から芽吹く様子を、ごく淡いアンビエント背景として敷く */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: shouldReduceMotion ? 1.08 : 1, opacity: 0.28 }}
          transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          {shouldReduceMotion ? (
            <Image
              src="/images/lp-hero-sprout-poster.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster="/images/lp-hero-sprout-poster.jpg"
              className="h-full w-full object-cover"
            >
              <source src="/images/lp-hero-sprout.mp4" type="video/mp4" />
            </video>
          )}
        </motion.div>
        <div className="absolute inset-0 bg-[#FAF8F4]/55" />
      </div>

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
