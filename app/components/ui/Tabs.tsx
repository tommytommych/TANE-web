'use client';

interface TabItem {
  id: string;
  label: string;
  icon?: string;
}

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

// TANE:i共通タブ切り替え：右サイドバーのタブ化などで使う汎用セグメントコントロール
export default function Tabs({ items, activeId, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex gap-1 p-1 bg-tanei-surface-muted rounded-tanei-control ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
            activeId === item.id
              ? 'bg-tanei-surface text-tanei-brand-dark shadow-sm'
              : 'text-tanei-ink-muted hover:text-tanei-ink'
          }`}
        >
          {item.icon && <span>{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
