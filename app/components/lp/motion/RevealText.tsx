'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { createElement, type ElementType } from 'react';

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

  // 【R3F導入に伴う既知の型エラー回避】タグ名を実行時に切り替えるElementType（as prop）を
  // <Tag>...</Tag>というJSX構文で使うと、@react-three/fiberがJSX.IntrinsicElementsへ
  // three.js要素を大量にマージした結果、TypeScriptの多相コンポーネント推論が
  // 「childrenがnever型」という誤検出を起こす（このファイル自体はThree.jsと無関係）。
  // createElement()による明示的な生成に切り替えることで、この推論経路を回避する
  // （実行時の挙動・出力DOMはJSX版と完全に同一）
  if (shouldReduceMotion) {
    return createElement(
      Tag,
      { className },
      lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))
    );
  }

  let charIndex = 0;

  return createElement(
    Tag,
    { className, 'aria-label': text.replace(/\n/g, ' ') },
    lines.map((line, lineIdx) => (
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
    ))
  );
}
