'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ElementType } from 'react';

interface RevealTextProps {
  text: string;
  className?: string;
  delay?: number;
  staggerDelay?: number;
  as?: ElementType;
}

// 見出しなどを1文字ずつスクロールで出現させる演出。改行(\n)は<br/>として扱う。
// スクリーンリーダーには文字が分割されて読み上げられないよう、親要素にaria-labelを付け
// 個々の文字spanはaria-hiddenにする
export default function RevealText({
  text,
  className = '',
  delay = 0,
  staggerDelay = 0.02,
  as: Tag = 'span',
}: RevealTextProps) {
  const shouldReduceMotion = useReducedMotion();
  const lines = text.split('\n');

  if (shouldReduceMotion) {
    return (
      <Tag className={className}>
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </Tag>
    );
  }

  let charIndex = 0;

  return (
    <Tag className={className} aria-label={text.replace(/\n/g, ' ')}>
      {lines.map((line, lineIdx) => (
        <span key={lineIdx} aria-hidden="true">
          {Array.from(line).map((char, i) => {
            const currentIndex = charIndex;
            charIndex += 1;
            return (
              <motion.span
                key={i}
                className="inline-block"
                style={char === ' ' ? { whiteSpace: 'pre' } : undefined}
                initial={{ opacity: 0, y: '0.4em' }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.5,
                  delay: delay + currentIndex * staggerDelay,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {char}
              </motion.span>
            );
          })}
          {lineIdx < lines.length - 1 && <br />}
        </span>
      ))}
    </Tag>
  );
}
