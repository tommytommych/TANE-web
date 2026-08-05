'use client';

import { useRef } from 'react';
import { useInView } from 'framer-motion';

interface LazyVideoProps {
  src: string;
  poster: string;
  className?: string;
}

// 画面内に入るまでは何も読み込まず、近づいたタイミングで初めて動画ソースを
// マウントする（自動再生の動画をページ読み込み時に一括ダウンロードしないため）
export default function LazyVideo({ src, poster, className = '' }: LazyVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const isInView = useInView(ref, { once: true, margin: '200px' });

  return (
    <video
      ref={ref}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      className={className}
    >
      {isInView && <source src={src} />}
    </video>
  );
}
