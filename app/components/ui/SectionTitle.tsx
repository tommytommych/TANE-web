import type { ReactNode } from 'react';

interface SectionTitleProps {
  icon?: string;
  children: ReactNode;
  className?: string;
}

// TANE:i共通の小見出し：「📺 見出し」形式の表記を統一する
export default function SectionTitle({ icon, children, className = '' }: SectionTitleProps) {
  return (
    <h3
      className={`text-sm font-bold text-tanei-ink-muted uppercase tracking-wider flex items-center gap-1.5 ${className}`}
    >
      {icon && <span className="text-base normal-case">{icon}</span>}
      <span>{children}</span>
    </h3>
  );
}
