'use client';

import { motion } from 'framer-motion';
import FadeIn from './motion/FadeIn';
import LazyVideo from './motion/LazyVideo';

const CLIPS = [
  {
    src: '/images/lp-work-consult.mov',
    poster: '/images/lp-work-consult-poster.jpg',
    caption: 'アイデアを、言葉に。',
  },
  {
    src: '/images/lp-work-material.mov',
    poster: '/images/lp-work-material-poster.jpg',
    caption: '材料を、揃える。',
  },
  {
    src: '/images/lp-work-build.mp4',
    poster: '/images/lp-work-build-poster.jpg',
    caption: '手を動かし、形に。',
  },
];

// TaneIセクション（暗色・スクロール連動ステップ表示）の直下に、実写の質感を
// ごく短く添える橋渡しセクション。長い工程解説（旧Flow/Works）は再導入せず、
// 3カットの雰囲気のみで「TANE:iを使うと現実に起きること」を示す
export default function TaneIGlimpse() {
  return (
    <section className="bg-[#1F3028] px-6 pb-28 pt-4 sm:pb-36">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {CLIPS.map((clip, index) => (
          <FadeIn key={clip.caption} delay={index * 0.1}>
            <motion.div
              initial="rest"
              whileHover="hover"
              animate="rest"
              className="group relative aspect-[4/5] w-full overflow-hidden rounded-sm"
            >
              <motion.div
                variants={{ rest: { scale: 1 }, hover: { scale: 1.05 } }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="h-full w-full"
              >
                <LazyVideo src={clip.src} poster={clip.poster} className="h-full w-full object-cover" />
              </motion.div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1F3028]/70 via-transparent to-transparent" />
            </motion.div>
            <p className="mt-4 text-center text-[13px] tracking-wide text-white/60">{clip.caption}</p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
