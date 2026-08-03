'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import RevealText from './motion/RevealText';

// TODO: 実際のブランドムービー素材（種→発芽→木→木材→制作→完成→暮らし の実写・実撮影動画）が
// 用意できたら、背景写真をこのアニメーション演出ごと <video autoPlay muted loop playsInline> に差し替える。
// 各ステップは意図的に短い名詞句にしてあるので、動画の字幕/チャプター名にもそのまま流用できる
const STORY_STEPS = [
  { icon: '🌱', label: '小さな種' },
  { icon: '🌍', label: '土へ落ちる' },
  { icon: '🌿', label: '芽が出る' },
  { icon: '🌳', label: '木になる' },
  { icon: '🪵', label: '木材になる' },
  { icon: '📐', label: '設計図' },
  { icon: '🛠️', label: 'DIY制作' },
  { icon: '🏠', label: '完成作品' },
  { icon: '😊', label: '暮らし' },
  { icon: '🌱', label: '新しいアイデアが生まれる' },
] as const;

const STEP_DURATION_MS = 2200;
const MESSAGE_DURATION_MS = 3400;

export default function Hero() {
  const shouldReduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [showClosingMessage, setShowClosingMessage] = useState(false);

  useEffect(() => {
    // 動きに敏感なユーザー向けには、自動サイクルせず最初のフレームで静止させる
    if (shouldReduceMotion) return;

    const isLastStep = stepIndex === STORY_STEPS.length - 1;
    const duration = showClosingMessage ? MESSAGE_DURATION_MS : STEP_DURATION_MS;

    const timer = setTimeout(() => {
      if (isLastStep && !showClosingMessage) {
        setShowClosingMessage(true);
      } else {
        setShowClosingMessage(false);
        setStepIndex((prev) => (prev + 1) % STORY_STEPS.length);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [stepIndex, showClosingMessage, shouldReduceMotion]);

  const currentStep = STORY_STEPS[stepIndex];

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] px-6 pt-24 text-center">
      {/* 背景写真：種から木へ育つ物語に重ねる、ごく淡いアンビエント背景 */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: shouldReduceMotion ? 1.08 : 1, opacity: 0.16 }}
          transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <Image
            src="/images/lp-hero-bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover grayscale"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[#FAF8F4]/55" />
      </div>

      {showClosingMessage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6" aria-hidden="true">
          <motion.p
            key="closing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="max-w-3xl text-center text-[clamp(28px,5vw,56px)] font-light leading-relaxed text-[#1F3028]/[0.07]"
          >
            一人の挑戦が、誰かの新しい種になる。
          </motion.p>
        </div>
      )}

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

      {/* 現在のストーリーステップのキャプション（動画の字幕のような位置づけ） */}
      {!shouldReduceMotion && (
        <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2">
          <AnimatePresence mode="wait">
            <motion.p
              key={showClosingMessage ? 'closing-caption' : stepIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-2 text-[11px] tracking-[0.3em] text-[#8A8A8A]"
            >
              {!showClosingMessage && <span aria-hidden="true">{currentStep.icon}</span>}
              {showClosingMessage ? 'TANE PROJECT' : currentStep.label}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
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
