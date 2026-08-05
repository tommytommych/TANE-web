'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import FadeIn from './motion/FadeIn';
import LazyVideo from './motion/LazyVideo';

const STORY = [
  {
    step: '01',
    title: '相談',
    desc: '頭の中にある想いを、言葉にして伝える。',
    type: 'video' as const,
    src: '/images/lp-work-consult.mov',
    poster: '/images/lp-work-consult-poster.jpg',
  },
  {
    step: '02',
    title: 'AI完成イメージ',
    desc: 'まだ見えない完成形を、AIと一緒に思い描く。',
    type: 'image' as const,
    src: '/images/lp-hero.jpg',
    alt: '木製デスクに置かれたノートパソコンとメガネ、マウス',
  },
  {
    step: '03',
    title: '設計図',
    desc: 'アイデアを、作れる形へ落とし込む。',
    type: 'image' as const,
    src: '/images/lp-work-measure.jpg',
    alt: '木材の上に置かれたさしがねとメジャー、鉛筆',
  },
  {
    step: '04',
    title: '材料調達',
    desc: '必要な木材を、ホームセンターで揃える。',
    type: 'video' as const,
    src: '/images/lp-work-material.mov',
    poster: '/images/lp-work-material-poster.jpg',
  },
  {
    step: '05',
    title: '制作',
    desc: '一つひとつの工程を、手を動かして進める。',
    type: 'video' as const,
    src: '/images/lp-work-build.mp4',
    poster: '/images/lp-work-build-poster.jpg',
  },
];

export default function Works() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section id="works" className="scroll-mt-24 bg-[#FAF8F4] px-6 py-32 sm:py-40">
      <FadeIn>
        <p className="text-center text-[12px] tracking-[0.3em] text-[#8A8A8A]">Example</p>
        <h2 className="mt-6 text-center text-[clamp(30px,4.5vw,48px)] font-light leading-[1.4] tracking-[-0.02em] text-[#1F3028]">
          ある日の相談が、
          <br />
          作品になるまで。
        </h2>
      </FadeIn>

      <div className="mx-auto mt-24 flex max-w-[1100px] flex-col gap-28">
        {STORY.map((item, index) => (
          <FadeIn key={item.title} delay={index * 0.05} scale={0.97}>
            <div className="flex items-baseline gap-4">
              <span className="text-[13px] tabular-nums tracking-widest text-[#8A8A8A]">{item.step}</span>
              <h3 className="text-[22px] font-normal text-[#1F3028]">{item.title}</h3>
            </div>
            <p className="mt-2 text-[14px] text-[#1F3028]/60">{item.desc}</p>

            <motion.div
              className="relative mt-8 aspect-[16/9] w-full overflow-hidden"
              whileHover={shouldReduceMotion ? undefined : 'hover'}
            >
              <motion.div
                className="absolute inset-0"
                variants={{ hover: { scale: 1.04 } }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                {item.type === 'video' ? (
                  <LazyVideo src={item.src} poster={item.poster} className="h-full w-full object-cover" />
                ) : (
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 1100px"
                    className="object-cover"
                  />
                )}
              </motion.div>
            </motion.div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
