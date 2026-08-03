import type { ReactNode } from 'react';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  muted?: boolean;
}

// TANE:i共通カード：角丸・ボーダー・シャドウを統一する見た目専用の入れ物
export default function Card({ children, className = '', padding = 'md', muted = false }: CardProps) {
  return (
    <div
      className={`rounded-tanei-card border border-tanei-border ${
        muted ? 'bg-tanei-surface-muted' : 'bg-tanei-surface'
      } shadow-sm ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
